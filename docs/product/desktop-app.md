# The desktop app

- **Platforms:** the desktop app on macOS, Windows and Linux; Get the apps also on the web in a browser and in the admin.
- **Prototype:** the web client with the toolbar's **App** set to **Desktop app** (`?app=desktop`), then **OS** (`&os=mac`, `windows` or `linux`), **Update** (`&update=ready`) and, on C1 on macOS, **Local network** (`&lan=asking` or `refused`). Get the apps is at `#/web/settings/about` and `#/web/downloads` in a browser, and behind **Get the apps** in `#/admin/system`'s Addresses. Prototyped at checkpoint 4.4a and approved by the owner on 2026-10-29.
- **Built:** at 4.4a, on [ADR 0053](../adr/0053-clients-build-and-distribution.md) and the desktop app's ADR.
- **Plan:** [phase-4-checkpoint-4.md › Prototypes first](../plans/phase-4-checkpoint-4.md#prototypes-first-44a). The platform guide is [desktop-web.md › Desktop app specifics](../design-language/platforms/desktop-web.md).

## Purpose

The desktop app is the web client in a window of its own, with what only an app can do: finding servers on the network, keeping films for offline, the computer's media keys, and updating itself. This spec covers what the app adds around the web client's screens (C1 to C8), which stay as they are: the window's chrome, its updates, the local network permission on a Mac, and how people get the app.

## The window

- **macOS:** the window has no title bar of its own. Its close, minimise and zoom buttons sit over the top bar, 20px from the window's edge and centred in its 64px, and the top bar leaves 84px for them before the server switcher. The top bar moves the window, as a title bar would. On the player the buttons stay over the film.
- **Windows and Linux:** a title bar in `bg`, 32px tall, above the top bar: the mark and "highsea" at the start, and the window's buttons at the end in the platform's shape. On Windows they're 46px wide caption buttons (Minimise, Maximise, Close), Close turning Windows' red on hover. On Linux they're round, as GNOME and KDE draw them. The title bar moves the window; its buttons aren't in the tab order, as the system's aren't. On the player the title bar lies over the film without its background and comes and goes with the player's controls.
- **Dialogs** open under the window's buttons and title bar, as they would under the system's: the window moves, minimises and closes whatever is open.
- **Full screen** (the player's, or the system's) hides all of it.

## Updates

The app checks for a new version by itself, at start and every 6 hours, and downloads it in the background. It never interrupts: an update is used the next time the app starts.

- **Ready:** a dot on the profile button (its label adds "An update is ready."), and at the end of its menu **Restart to update** with "highsea {new} is ready. You have {current}."
- **Settings › About** in the app: This app reads "highsea {version} for Mac" (or Windows, or Linux), then either "Up to date. highsea checks for a new version by itself, last {time ago}." or a box with "highsea {new} is ready. It's used the next time the app starts." and **Restart to update**.
- **Restart to update** quits, installs and opens the app again where it was.

## Local network on a Mac

macOS 15 and later ask the person before an app may find devices on the local network ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)). The system asks the first time C1 looks. C1's **On this network** says:

- **While the system asks:** the status reads "Waiting for your Mac…", and the list "Your Mac is asking whether highsea may find devices on your local network. Choose Allow to look for servers."
- **Refused:** no status and no **Look again**; the list says "highsea can't look on this network. Allow it in System Settings › Privacy & Security › Local Network, or add the server by address." Adding by address still works.
- **Allowed:** as connectivity.md has it.

Windows and Linux don't ask.

## Get the apps

A list of the desktop app for each computer, the one the page is open on first (marked "This computer", with its download as the primary button), then the address to type when the app can't find the server by itself.

| Computer | Line | Downloads |
| --- | --- | --- |
| macOS | Apple silicon and Intel | **Download .dmg** |
| Windows | Windows 10 and 11, 64-bit; "Windows may say it doesn't recognise the installer. Choose More info, then Run anyway." | **Download .exe** |
| Linux | Ubuntu, Debian, Fedora and others | **.AppImage**, **.deb**, **.rpm** |

Then "The app finds {server} on this network by itself. Anywhere else, add it by this address:", the address (the remote one if the server has it, else its address on the network) and **Copy** ("Address copied").

Where it is:

- **The web client in a browser:** Settings › About's **Get the apps**, and Downloads' **Get the desktop app** ("Downloads live in the desktop app"). Both open it as a dialog. Inside the desktop app neither shows.
- **The admin:** **Get the apps** beside **Network and remote access** under System › Status › Addresses, as a dialog. The admin has no account menu, so the plan's "account menu" became this, beside the addresses it's about.

The phone and TV apps join the list when they exist (4.5, 4.6), with their stores' QR codes.

## Kept in

The desktop app's Downloads has the folder its downloads are kept in under its settings: [client-settings.md › Offline](client-settings.md#offline).

## Decisions

- **The window buttons are the platform's,** in the platform's place and shape, so the app feels like the computer's own; everything inside the window is highsea's.
- **Updates wait for a restart.** Restarting a film someone is watching to update the app is never worth it.
- **Windows' installer is unsigned until 1.0** (the plan's answer 6), so Get the apps says what Windows will show, before it's seen.
- **Get the apps is where people already look:** About, Downloads, and beside the server's addresses.
