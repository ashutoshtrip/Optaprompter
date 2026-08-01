//! OS-level "invisible to screen share" plumbing.
//!
//! Tauri v2's `WebviewWindow::set_content_protected` already calls the right
//! native APIs on macOS and Windows, so the cross-platform path is a one-liner.
//! We keep this module because:
//!   * it centralises the platform notes in one place
//!   * on macOS we additionally raise the NSWindow above the "screen saver"
//!     level so screen recorders that key off window level (rare, but exists)
//!     also skip it
//!   * on Windows we can log the effective `WDA_EXCLUDEFROMCAPTURE` state for
//!     diagnostics — some GPU drivers silently ignore the flag.

use tauri::{Runtime, WebviewWindow};

/// Enable / disable screen-share exclusion on the given window.
///
/// | OS      | Mechanism                                                      |
/// |---------|----------------------------------------------------------------|
/// | macOS   | `NSWindow.sharingType = NSWindowSharingTypeNone` (via Tauri)   |
/// | Windows | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (via Tauri) |
/// | Linux   | best-effort — Wayland/X11 have no equivalent; call is a no-op |
pub fn set_capture_protection<R: Runtime>(
    window: &WebviewWindow<R>,
    protected: bool,
) -> tauri::Result<()> {
    window.set_content_protected(protected)?;

    #[cfg(target_os = "macos")]
    macos::harden_window_level(window, protected);

    Ok(())
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSWindow, NSWindowLevel};
    use tauri::{Runtime, WebviewWindow};

    /// Raise the window above the screen-saver level so it renders on top even
    /// when full-screen apps are active. This is orthogonal to `sharingType`;
    /// combined they make the overlay robust against most capture routes.
    pub fn harden_window_level<R: Runtime>(window: &WebviewWindow<R>, protected: bool) {
        // Safety: `ns_window()` returns a valid NSWindow* while the window exists.
        let Ok(ns_window_ptr) = window.ns_window() else { return };
        if ns_window_ptr.is_null() {
            return;
        }

        unsafe {
            let ns_window: Retained<NSWindow> =
                Retained::retain(ns_window_ptr as *mut NSWindow).expect("valid NSWindow");

            // Screen-saver level = 1000; normal floating = 3. Above the SS
            // level ensures screen recorders that composite by level skip us.
            let level: NSWindowLevel = if protected { 1001 } else { 3 };
            ns_window.setLevel(level);

            // Prevent the window from appearing in Mission Control / window
            // switchers, which some capture tools enumerate.
            let _ = ns_window; // (setCollectionBehavior is set from JS via Tauri)
            let _: *mut AnyObject = std::ptr::null_mut();
        }
    }
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub mod windows_diag {
    //! Optional diagnostics helper. Tauri already calls
    //! `SetWindowDisplayAffinity` internally; if you need to verify the flag
    //! stuck (some virtualised GPUs silently drop it), call
    //! `check_display_affinity(hwnd)` from a debug command.

    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    pub fn check_display_affinity(hwnd: isize) -> Option<bool> {
        let hwnd = HWND(hwnd as *mut _);
        let mut affinity = 0u32;
        // SAFETY: hwnd is provided by Tauri; GetWindowDisplayAffinity is safe
        // for any live HWND.
        let ok = unsafe { GetWindowDisplayAffinity(hwnd, &mut affinity) }.is_ok();
        if !ok {
            return None;
        }
        Some(affinity == WDA_EXCLUDEFROMCAPTURE.0)
    }
}
