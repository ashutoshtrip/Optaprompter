//! OS-level overlay hardening.

use tauri::{Runtime, WebviewWindow};

pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)
}

/// Make the overlay float above everything — including apps in their own
/// fullscreen Space (Chrome fullscreen, PPT/Keynote presenter mode, etc.).
pub fn harden_always_on_top<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    macos::apply_window(window);
}

/// Flip the app to `NSApplicationActivationPolicyAccessory` — no Dock,
/// no Cmd+Tab, but our windows can appear over other apps' fullscreen
/// Spaces. **Without this, cross-app fullscreen overlay doesn't work on
/// macOS**, regardless of window level or collection behavior.
pub fn set_accessory_app() {
    #[cfg(target_os = "macos")]
    macos::set_accessory_app();
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::{class, msg_send, sel, sel_impl};
    use tauri::{Runtime, WebviewWindow};

    // NSApplicationActivationPolicy.Accessory
    const APP_POLICY_ACCESSORY: i64 = 1;

    pub fn set_accessory_app() {
        unsafe {
            let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
            if ns_app.is_null() {
                eprintln!("[optaprompter] NSApp is null");
                return;
            }
            let ok: bool = msg_send![ns_app, setActivationPolicy: APP_POLICY_ACCESSORY];
            eprintln!(
                "[optaprompter] setActivationPolicy(Accessory) → {}",
                if ok { "ok" } else { "failed" }
            );
        }
    }

    // NSPopUpMenuWindowLevel = 101 — the tier most macOS overlays use.
    const OVERLAY_LEVEL: i64 = 101;

    // NSWindowCollectionBehavior bits, sent as raw u64.
    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const TRANSIENT: u64 = 1 << 3;
    const STATIONARY: u64 = 1 << 4;
    const IGNORES_CYCLE: u64 = 1 << 6;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    // NSWindowStyleMask bits (only ones we care about).
    const STYLE_MASK_BORDERLESS: u64 = 0;
    const STYLE_MASK_NONACTIVATING_PANEL: u64 = 1 << 7; // valid on NSWindow too in practice

    pub fn apply_window<R: Runtime>(window: &WebviewWindow<R>) {
        let Ok(ns_window_ptr) = window.ns_window() else {
            eprintln!("[optaprompter] ns_window() failed");
            return;
        };
        if ns_window_ptr.is_null() {
            eprintln!("[optaprompter] ns_window() returned null");
            return;
        }
        let ns_window = ns_window_ptr as id;

        let behavior: u64 = CAN_JOIN_ALL_SPACES
            | TRANSIENT
            | STATIONARY
            | IGNORES_CYCLE
            | FULL_SCREEN_AUXILIARY;

        unsafe {
            let _: () = msg_send![ns_window, setLevel: OVERLAY_LEVEL];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];

            // Add the "nonactivating panel" bit to the style mask. This tells
            // AppKit that focusing the window shouldn't activate the app,
            // which is what actually lets it appear in other apps' fullscreen
            // Spaces. Works on NSWindow even though the flag is documented
            // for NSPanel.
            let current_mask: u64 = msg_send![ns_window, styleMask];
            let new_mask = current_mask | STYLE_MASK_NONACTIVATING_PANEL | STYLE_MASK_BORDERLESS;
            let _: () = msg_send![ns_window, setStyleMask: new_mask];

            let _: () = msg_send![ns_window, orderFrontRegardless];

            let effective_level: i64 = msg_send![ns_window, level];
            let effective_behavior: u64 = msg_send![ns_window, collectionBehavior];
            let effective_mask: u64 = msg_send![ns_window, styleMask];
            eprintln!(
                "[optaprompter] level={} behavior={:#x} styleMask={:#x} (nonact={})",
                effective_level,
                effective_behavior,
                effective_mask,
                (effective_mask & STYLE_MASK_NONACTIVATING_PANEL) != 0
            );
        }
    }
}
