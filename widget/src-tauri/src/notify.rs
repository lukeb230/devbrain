// ============================================================================
// Native notifications via UNUserNotificationCenter (the modern API).
//
// Why not tauri-plugin-notification: on macOS it goes through notify-rust →
// mac-notification-sys → NSUserNotificationCenter, deprecated since 10.14 and
// silently non-functional on macOS 26 — calls "succeed" and nothing appears.
// UNUserNotificationCenter needs a bundled app with a bundle id (we are one)
// and is what makes DevBrain show up under System Settings → Notifications.
//
// Commands (invoked from the panel page):
//   notification_status()     → "granted" | "denied" | "not_determined" | "unsupported"
//   notify(title, body)       → "delivered" | "denied" | "error: …"
//   open_notification_settings()
// ============================================================================

#[cfg(target_os = "macos")]
mod mac {
    use block2::{DynBlock, RcBlock};
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, AnyThread};
    use objc2_foundation::{NSError, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
        UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationSettings,
        UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use std::sync::{mpsc, OnceLock};
    use std::time::Duration;

    // Without a delegate, macOS files notifications quietly (Notification
    // Center only, no banner) whenever this app is frontmost — which is
    // exactly when someone clicks "Send test notification" in the panel.
    // This delegate asks for banner + sound + list regardless.
    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "DevBrainNotificationDelegate"]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::Sound
                    | UNNotificationPresentationOptions::List,));
            }
        }
    );

    static DELEGATE: OnceLock<Retained<Delegate>> = OnceLock::new();

    /// Install the presentation delegate. Call once at startup (main thread).
    pub fn install_delegate() {
        let Ok(c) = center() else { return };
        let d = DELEGATE.get_or_init(|| {
            // SAFETY: NSObject's init has no requirements.
            unsafe { objc2::msg_send![Delegate::alloc(), init] }
        });
        c.setDelegate(Some(ProtocolObject::from_ref(&**d)));
    }

    fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
        // Throws an ObjC exception when the process has no bundle (e.g. a bare
        // `cargo run`); catch it so a dev build degrades to "unsupported".
        objc2::exception::catch(|| UNUserNotificationCenter::currentNotificationCenter())
            .map_err(|_| "unsupported: not running as an app bundle".to_string())
    }

    pub fn status() -> String {
        let Ok(c) = center() else { return "unsupported".into() };
        let (tx, rx) = mpsc::channel::<UNAuthorizationStatus>();
        let block = RcBlock::new(move |settings: std::ptr::NonNull<UNNotificationSettings>| {
            let s = unsafe { settings.as_ref().authorizationStatus() };
            let _ = tx.send(s);
        });
        c.getNotificationSettingsWithCompletionHandler(&block);
        match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(UNAuthorizationStatus::Authorized) | Ok(UNAuthorizationStatus::Provisional) => "granted".into(),
            Ok(UNAuthorizationStatus::Denied) => "denied".into(),
            Ok(UNAuthorizationStatus::NotDetermined) => "not_determined".into(),
            Ok(_) => "granted".into(),
            Err(_) => "error: settings query timed out".into(),
        }
    }

    fn request_authorization(c: &UNUserNotificationCenter) -> Result<bool, String> {
        let (tx, rx) = mpsc::channel::<Result<bool, String>>();
        let block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
            let r = if error.is_null() {
                Ok(granted.as_bool())
            } else {
                Err(unsafe { (*error).localizedDescription().to_string() })
            };
            let _ = tx.send(r);
        });
        c.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound | UNAuthorizationOptions::Badge,
            &block,
        );
        rx.recv_timeout(Duration::from_secs(60)).map_err(|_| "authorization prompt timed out".to_string())?
    }

    pub fn notify(title: &str, body: &str) -> String {
        let c = match center() { Ok(c) => c, Err(e) => return e };
        // Delegate installed lazily on first use (not at launch — see setup()).
        install_delegate();
        // Ask first (no-op if already decided); a denial here is the honest answer.
        match request_authorization(&c) {
            Ok(true) => {}
            Ok(false) => return "denied".into(),
            Err(e) => return format!("error: {e}"),
        }
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(title));
        content.setBody(&NSString::from_str(body));
        content.setSound(Some(&UNNotificationSound::defaultSound()));
        let id = NSString::from_str(&format!("devbrain-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&id, &content, None);
        let (tx, rx) = mpsc::channel::<Option<String>>();
        let block = RcBlock::new(move |error: *mut NSError| {
            let _ = tx.send(if error.is_null() { None } else { Some(unsafe { (*error).localizedDescription().to_string() }) });
        });
        c.addNotificationRequest_withCompletionHandler(&request, Some(&block));
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(None) => "delivered".into(),
            Ok(Some(e)) => format!("error: {e}"),
            Err(_) => "error: delivery timed out".into(),
        }
    }
}

// Both wait on system completion handlers (the permission prompt can take as
// long as the user does), so they run on a blocking task, never the UI thread.
#[tauri::command]
pub async fn notification_status() -> String {
    #[cfg(target_os = "macos")]
    { tauri::async_runtime::spawn_blocking(mac::status).await.unwrap_or_else(|_| "error: task failed".into()) }
    #[cfg(not(target_os = "macos"))]
    { "unsupported".to_string() }
}

#[tauri::command]
pub async fn notify(app: tauri::AppHandle, title: String, body: String) -> String {
    #[cfg(target_os = "macos")]
    {
        let r = tauri::async_runtime::spawn_blocking(move || mac::notify(&title, &body))
            .await
            .unwrap_or_else(|_| "error: task failed".into());
        // Registering with Notification Center can make macOS treat the app
        // as a regular (Dock) app — seen when the delegate was installed at
        // launch. Re-assert the menu-bar-only policy after every delivery.
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        r
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, title, body); "unsupported".to_string() }
}

// NOTE: the delegate is installed lazily by notify(), never at launch —
// creating the notification center during startup made macOS register the
// app as a regular foreground app (Dock icon) despite the Accessory policy.

#[tauri::command]
pub fn open_notification_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .spawn();
    }
}
