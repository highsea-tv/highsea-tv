#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# The install wizard, and the upgrade wizard (scripts/spk.ts packs this file as upgrade_uifile.sh
# too). DSM runs install_uifile.sh before installing and upgrade_uifile.sh before upgrading, and
# shows the JSON they write to SYNOPKG_TEMP_LOGFILE (DSM 7 Developer Guide, WIZARD_UIFILES:
# https://help.synology.com/developer-guide/synology_package/wizard/WIZARD_UIFILES_v2.html).
#
# The first step lists the NAS's shared folders in a dropdown, from a list this script writes
# itself (SynoCommunity's wizards document the combobox with a local "arraystore":
# https://github.com/SynoCommunity/spksrc/blob/master/docs/developer-guide/packaging/wizards.md).
# Not one filled from DSM's share API (api_store): DSM 7.4.1 preselected the first share whatever
# defaultValue said (ADR 0057, 2026-10-29), so one click of Next would grant highsea a folder nobody
# chose. Here the first entry is always the safe one: the folder chosen before, or a new highsea.
# Shared folders are the folders at the top of each volume, as OpenAver's package lists them
# (its WIZARD_UIFILES/install_uifile.sh); DSM's synoshare is root's only.
#
# HIGHSEA_WIZARD_ROOT is for scripts/spk.test.ts, which runs this against a folder of its own.
root="${HIGHSEA_WIZARD_ROOT:-}"
case "$(basename "$0")" in
  upgrade_uifile*) upgrade=true ;;
  *) upgrade=false ;;
esac

# What was chosen before: the installed package's settings, or the ones an uninstall kept
# (postinst writes them; postuninst deletes them only when told to).
share=""
for conf in "$root/var/packages/highsea/var/package.conf" "$root"/volume*/@appdata/highsea/package.conf; do
  [ -r "$conf" ] || continue
  share=$(sed -n 's/^share=//p' "$conf")
  break
done

# The upgrade wizard's key is its own, so preinst can tell an upgrade someone chose in Package
# Center from one with no wizard, which still has the install wizard's default.
if [ "$upgrade" = true ]; then key=wizard_upgrade_share; else key=wizard_data_share; fi

# The shared folders: the volumes' top folders, without DSM's own (@appstore, #snapshot) and
# without names the compose project's .env can't quote.
list() {
  for vol in "$root"/volume[0-9]*; do
    [ -d "$vol" ] || continue
    for dir in "$vol"/*/; do
      [ -d "$dir" ] || continue
      name=$(basename "$dir")
      case "$name" in
        @* | \#* | .* | lost+found) continue ;;
        *[\"\\\'\$\`]*) continue ;;
      esac
      printf '%s\n' "$name"
    done
  done | sort -f -u
}
shares=$(list)

# The entry first in the list, which DSM selects: the folder chosen before, or highsea.
if [ -n "$share" ]; then
  first="$share"
  if [ "$upgrade" = true ]; then first_label="$share (now)"; else first_label="$share (as before)"; fi
elif printf '%s\n' "$shares" | grep -qx highsea; then
  first=highsea
  first_label=highsea
else
  first=highsea
  first_label="highsea, a new shared folder"
fi

entries="[\"$first_label\", \"$first\"]"
while IFS= read -r name; do
  [ -n "$name" ] && [ "$name" != "$first" ] || continue
  entries="$entries, [\"$name\", \"$name\"]"
done <<NAMES
$shares
NAMES

# Only the shared folder: which folders in it hold the library, and whether highsea manages each one
# or only reads it, are chosen in highsea's setup and Settings, since every library is laid out its
# own way.
intro="highsea gets read and write access to one shared folder, the one that holds your films, shows and music. Its downloads go there too, so imports are hardlinks rather than copies. In highsea's setup and in Settings, you choose the library's folders inside it, and whether highsea manages each one or only reads it. What highsea makes itself, such as previews and transcodes, goes in a highsea folder inside it."
if [ -n "$shares" ]; then
  folder=$(cat <<JSON
      {
        "type": "combobox",
        "desc": "$intro",
        "subitems": [
          {
            "key": "$key",
            "desc": "Shared folder",
            "defaultValue": "$first",
            "editable": false,
            "mode": "local",
            "displayField": "display",
            "valueField": "value",
            "store": { "xtype": "arraystore", "fields": ["display", "value"], "data": [$entries] },
            "validator": { "allowBlank": false }
          }
        ]
      }
JSON
)
else
  # nothing listed (a volume this script can't read): type the name, as before
  folder=$(cat <<JSON
      {
        "type": "textfield",
        "desc": "$intro Type the name of a shared folder, or keep highsea to make a new one.",
        "subitems": [
          {
            "key": "$key",
            "desc": "Shared folder",
            "defaultValue": "$first",
            "validator": {
              "allowBlank": false,
              "regex": {
                "expr": "/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/",
                "errorText": "Use letters, numbers, spaces, dots, dashes and underscores, up to 32 characters."
              }
            }
          }
        ]
      }
JSON
)
fi

if [ "$upgrade" = true ]; then
  last_title="What changes"
  last="highsea's settings, database and backups are kept. If you chose another shared folder, the library's and the downloads' folders in highsea keep their paths under /data: check them in Settings › Media management after the update. The shared folder used before keeps highsea's access until you remove it in Control Panel › Shared Folder › Edit › Permissions.<br><br>The guide: <a href='https://docs.highsea.tv/install/synology/' target='_blank'>docs.highsea.tv/install/synology</a>"
else
  last_title="Before you start"
  last="Container Manager downloads highsea's image and starts it, which can take a few minutes; you can follow it in Container Manager. Then open highsea at port 3000 of this NAS, for example http://your-nas:3000, and set it up there. highsea finds the graphics chip by itself.<br><br>The guide: <a href='https://docs.highsea.tv/install/synology/' target='_blank'>docs.highsea.tv/install/synology</a>"
fi

cat > "${SYNOPKG_TEMP_LOGFILE:-/dev/stdout}" <<JSON
[
  {
    "step_title": "Your shared folder",
    "invalid_next_disabled": true,
    "items": [
$folder
    ]
  },
  {
    "step_title": "$last_title",
    "items": [{ "desc": "$last" }]
  }
]
JSON
exit 0
