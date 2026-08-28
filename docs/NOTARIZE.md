# Signing + notarizing the Mac app (when the Apple Developer account exists)

Today CI ad-hoc signs (`codesign -s -`). A fresh browser download is therefore
quarantined and refused as "damaged"; `install.sh` and the updater strip the
flag. With a Developer ID the DMG just opens. Everything below touches only
`.github/workflows/widget-release.yml`, `widget/src-tauri/tauri.conf.json`
and two new plist files.

## 1. Apple side (once)
- Developer ID Application certificate → export `.p12` with a password.
- App Store Connect API key (Team key, role Developer): note Key ID, Issuer
  ID, download the `.p8`. (Preferred over Apple ID + app-specific password —
  no personal 2FA in CI.)

## 2. GitHub repo secrets
`APPLE_CERTIFICATE` (base64 of the .p12) · `APPLE_CERTIFICATE_PASSWORD` ·
`APPLE_SIGNING_IDENTITY` (`Developer ID Application: Name (TEAMID)`) ·
`APPLE_TEAM_ID` · `APPLE_API_KEY` (key id) · `APPLE_API_ISSUER` ·
`APPLE_API_KEY_P8` (base64 of the .p8).

## 3. Workflow changes
1. **Keychain step** before the build:
   ```sh
   KC=$RUNNER_TEMP/build.keychain-db
   security create-keychain -p "" "$KC"; security set-keychain-settings -lut 21600 "$KC"; security unlock-keychain -p "" "$KC"
   echo "$APPLE_CERTIFICATE" | base64 --decode > $RUNNER_TEMP/cert.p12
   security import $RUNNER_TEMP/cert.p12 -k "$KC" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
   security set-key-partition-list -S apple-tool:,apple: -s -k "" "$KC"
   security list-keychains -d user -s "$KC" login.keychain-db
   echo "$APPLE_API_KEY_P8" | base64 --decode > $RUNNER_TEMP/AuthKey.p8
   xcrun notarytool store-credentials devbrain --key $RUNNER_TEMP/AuthKey.p8 --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"
   ```
2. **Delete the `codesign --deep -s -` step.** The bundled Node from
   nodejs.org is already Developer-ID-signed by the OpenJS Foundation with
   hardened runtime; `--deep -s -` destroys that. Notarization accepts nested
   code signed by any valid Developer ID. If notarization ever rejects it,
   re-sign node with your identity, `--options runtime --timestamp`, and the
   entitlements `com.apple.security.cs.allow-jit`,
   `allow-unsigned-executable-memory`, `disable-library-validation`.
3. **`tauri.conf.json`** → `bundle.macOS`: `"signingIdentity": null`
   (read from `APPLE_SIGNING_IDENTITY`; local builds stay ad-hoc),
   `"hardenedRuntime": true`, `"entitlements": "Entitlements.plist"`,
   `"minimumSystemVersion": "12.0"`.
4. **`widget/src-tauri/Entitlements.plist`**: only
   `com.apple.security.automation.apple-events = true` (the Reminders
   collector goes through `osascript`). No JIT entitlements for the Tauri
   binary (WKWebView's JIT lives in its own XPC process).
5. **`widget/src-tauri/Info.plist`** (Tauri merges it):
   `NSAppleEventsUsageDescription` ("DevBrain reads your Reminders lists to
   sync tasks") and `NSRemindersUsageDescription`. Hardened runtime + missing
   usage strings = silent TCC denial.
6. **After the build**, per channel:
   ```sh
   codesign --verify --deep --strict --verbose=2 "$APP_NAME.app"
   ditto -c -k --sequesterRsrc --keepParent "$APP_NAME.app" notarize.zip
   xcrun notarytool submit notarize.zip --keychain-profile devbrain --wait --timeout 30m
   xcrun stapler staple "$APP_NAME.app"
   ditto -c -k --sequesterRsrc --keepParent "$APP_NAME.app" "$ASSET.app.zip"   # re-zip the STAPLED app
   shasum -a 256 "$ASSET.app.zip" > "$ASSET.app.zip.sha256"
   hdiutil create … "$ASSET.dmg"                                              # from the stapled app
   codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$ASSET.dmg"
   xcrun notarytool submit "$ASSET.dmg" --keychain-profile devbrain --wait
   xcrun stapler staple "$ASSET.dmg"
   spctl -a -t exec -vv "$APP_NAME.app"      # expect: source=Notarized Developer ID
   ```
   On failure: `xcrun notarytool log <id> --keychain-profile devbrain`.
7. **Updater hardening** (`cli/bin/devbrain.mjs updateWidget`): before the
   swap, `codesign --verify --deep --strict` and check
   `codesign -dv … | grep TeamIdentifier=<TEAMID>` — refuse a downgrade to an
   ad-hoc build. Keep the `xattr` strip for old assets.
8. **TCC re-prompt**: Notifications and Reminders grants are keyed on the
   code's designated requirement, which changes with the identity. Everyone
   is re-prompted once after the first signed update — say so in the release
   notes.
9. **Docs**: drop the "damaged" / `xattr` paragraphs from `ONBOARDING.md`,
   `widget/README.md` and the release notes once `spctl` says Notarized.

## Verify
`spctl -a -t exec -vv DevBrain.app` → `Notarized Developer ID`;
`stapler validate` on the app and the DMG; a fresh Safari download opens with
no dialog; notifications and Reminders sync still work after the re-prompt.
