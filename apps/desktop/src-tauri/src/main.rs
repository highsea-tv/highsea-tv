// SPDX-License-Identifier: AGPL-3.0-only
// no console window behind the app on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    highsea_desktop_lib::run()
}
