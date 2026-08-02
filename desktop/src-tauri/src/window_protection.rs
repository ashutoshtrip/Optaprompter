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
/// Spaces. Required for the overlay to be visible over other apps in
/// fullscreen on macOS.
pub fn set_accessory_app() {
    #[cfg(target_os = "macos")]
    macos::set_accessory_app();
}

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::base::id;
    use objc::runtime::{Class, Object};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::Once;
    use tauri::{Runtime, WebviewWindow};

    // libobjc runtime function — swap an object's class at runtime.
    extern "C" {
        fn object_setClass(obj: *mut Object, cls: *const Class) -> *const Class;
    }

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

    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const TRANSIENT: u64 = 1 << 3;
    const STATIONARY: u64 = 1 << 4;
    const IGNORES_CYCLE: u64 = 1 << 6;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    const STYLE_MASK_NONACTIVATING_PANEL: u64 = 1 << 7;

    static CLASS_SWAPPED: Once = Once::new();

    /// Change the underlying NSWindow instance into an NSPanel by rewriting
    /// its class pointer. This is what enables `NSWindowStyleMaskNonactivatingPanel`
    /// to actually take effect — which is what lets the window appear in
    /// other apps' fullscreen Spaces.
    unsafe fn convert_to_panel(ns_window: id) -> bool {
        let panel_cls_opt = Class::get("NSPanel");
        let Some(panel_cls) = panel_cls_opt else {
            eprintln!("[optaprompter] Class::get(NSPanel) returned None");
            return false;
        };
        object_setClass(ns_window as *mut Object, panel_cls as *const Class);
        eprintln!("[optaprompter] NSWindow → NSPanel class swap done");
        true
    }

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

        // One-time class swap so nonactivating-panel styleMask actually sticks.
        CLASS_SWAPPED.call_once(|| unsafe {
            let _ = convert_to_panel(ns_window);
        });

        let behavior: u64 = CAN_JOIN_ALL_SPACES
            | TRANSIENT
            | STATIONARY
            | IGNORES_CYCLE
            | FULL_SCREEN_AUXILIARY;

        unsafe {
            // Now that we're an NSPanel, this bit takes effect.
            let current_mask: u64 = msg_send![ns_window, styleMask];
            let new_mask = current_mask | STYLE_MASK_NONACTIVATING_PANEL;
            let _: () = msg_send![ns_window, setStyleMask: new_mask];

            let _: () = msg_send![ns_window, setLevel: OVERLAY_LEVEL];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            let _: () = msg_send![ns_window, setHidesOnDeactivate: false];

            // NSPanel-specific: don't become key window on click.
            let _: () = msg_send![ns_window, setBecomesKeyOnlyIfNeeded: true];
            // NSPanel-specific: float above regular windows.
            let _: () = msg_send![ns_window, setFloatingPanel: true];

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
