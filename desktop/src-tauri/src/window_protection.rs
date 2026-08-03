//! OS-level overlay hardening.
//!
//! Split into two phases:
//!   * `apply_baseline(window)` — always-on-top + content-protected. Applied
//!     at startup and stays on for every screen. Keeps normal keyboard input.
//!   * `enter_overlay_mode(window)` — the aggressive stack: accessory app
//!     policy, NSPanel class swap, nonactivating style, fullscreen-Space
//!     collection behavior. Enabled *only* when the reader view is shown.
//!     Without this, the overlay disappears behind fullscreen apps; with it,
//!     text inputs can't receive keyboard focus — hence the split.
//!   * `leave_overlay_mode(window)` — undo the parts that block input so the
//!     picker/auth screens work normally when the user goes back.

use tauri::{Runtime, WebviewWindow};

pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)
}

/// Baseline overlay behavior — applied at startup and never removed.
/// Just always-on-top + present on all workspaces. Doesn't block input.
pub fn apply_baseline<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);
}

/// Enable the full overlay stack (accessory app, nonactivating panel, fullscreen
/// visibility). Call when the reader view opens.
pub fn enter_overlay_mode<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    macos::enter_overlay_mode(window);
}

/// Undo the parts of overlay mode that block keyboard input, so screens with
/// text fields (auth, room picker) work normally. Call on leaving the reader.
pub fn leave_overlay_mode<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    macos::leave_overlay_mode(window);
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::runtime::{Class, Object};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::Once;
    use tauri::{Runtime, WebviewWindow};

    extern "C" {
        fn object_setClass(obj: *mut Object, cls: *const Class) -> *const Class;
    }

    // NSApplicationActivationPolicy
    const APP_POLICY_REGULAR: i64 = 0;
    const APP_POLICY_ACCESSORY: i64 = 1;

    // NSPopUpMenuWindowLevel — high enough to sit above every non-system window.
    const OVERLAY_LEVEL: i64 = 101;
    const NORMAL_LEVEL: i64 = 0;

    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const TRANSIENT: u64 = 1 << 3;
    const STATIONARY: u64 = 1 << 4;
    const IGNORES_CYCLE: u64 = 1 << 6;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    const STYLE_MASK_NONACTIVATING_PANEL: u64 = 1 << 7;

    static CLASS_SWAPPED: Once = Once::new();

    unsafe fn convert_to_panel(ns_window: id) {
        let Some(panel_cls) = Class::get("NSPanel") else {
            eprintln!("[optaprompter] Class::get(NSPanel) returned None");
            return;
        };
        object_setClass(ns_window as *mut Object, panel_cls as *const Class);
        eprintln!("[optaprompter] NSWindow → NSPanel class swap done");
    }

    unsafe fn set_activation_policy(policy: i64) {
        let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
        if ns_app.is_null() {
            return;
        }
        let _: bool = msg_send![ns_app, setActivationPolicy: policy];
        if policy == APP_POLICY_REGULAR {
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    fn ns_window_of<R: Runtime>(window: &WebviewWindow<R>) -> Option<id> {
        let ns_window_ptr = window.ns_window().ok()?;
        if ns_window_ptr.is_null() {
            return None;
        }
        Some(ns_window_ptr as id)
    }

    pub fn enter_overlay_mode<R: Runtime>(window: &WebviewWindow<R>) {
        let Some(ns_window) = ns_window_of(window) else { return };

        unsafe {
            set_activation_policy(APP_POLICY_ACCESSORY);

            CLASS_SWAPPED.call_once(|| convert_to_panel(ns_window));

            let current_mask: u64 = msg_send![ns_window, styleMask];
            let new_mask = current_mask | STYLE_MASK_NONACTIVATING_PANEL;
            let _: () = msg_send![ns_window, setStyleMask: new_mask];

            let behavior: u64 = CAN_JOIN_ALL_SPACES
                | TRANSIENT
                | STATIONARY
                | IGNORES_CYCLE
                | FULL_SCREEN_AUXILIARY;
            let _: () = msg_send![ns_window, setLevel: OVERLAY_LEVEL];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
            let _: () = msg_send![ns_window, setBecomesKeyOnlyIfNeeded: true];
            let _: () = msg_send![ns_window, setFloatingPanel: true];
            let _: () = msg_send![ns_window, orderFrontRegardless];
        }
    }

    pub fn leave_overlay_mode<R: Runtime>(window: &WebviewWindow<R>) {
        let Some(ns_window) = ns_window_of(window) else { return };

        unsafe {
            // Restore Regular activation so keyboard input works normally.
            set_activation_policy(APP_POLICY_REGULAR);

            // Remove the nonactivating panel bit so the window becomes
            // interactive & keyboardable again. Class stays NSPanel (one-way
            // swap) but that's fine — a plain NSPanel accepts key events.
            let current_mask: u64 = msg_send![ns_window, styleMask];
            let new_mask = current_mask & !STYLE_MASK_NONACTIVATING_PANEL;
            let _: () = msg_send![ns_window, setStyleMask: new_mask];

            // Drop level back to normal so it doesn't hover weirdly during
            // sign-in / picker screens.
            let _: () = msg_send![ns_window, setLevel: NORMAL_LEVEL];
            let _: () = msg_send![ns_window, setBecomesKeyOnlyIfNeeded: false];
            let _: () = msg_send![ns_window, setFloatingPanel: false];

            // Make it the key window so text fields get keystrokes.
            let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null::<Object>()];
        }
    }
}
