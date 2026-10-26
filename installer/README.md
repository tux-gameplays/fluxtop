# Fluxtop installer

The Fluxtop installer supports native, writable Fluxer installations. On Linux,
automatic discovery checks common locations such as `/opt/Fluxer`,
`/usr/lib/fluxer`,
`~/.local/opt`, and `~/.local/share` for stable and Canary releases. If an
installation is elsewhere, choose its `resources/app.asar` file (or its
`resources` directory) in the GUI, or set `FLUXER_ASAR` to the archive path for
CLI use.

The current user must have write permission for both the selected `app.asar`
and its containing `resources` directory. Fluxtop does not elevate privileges;
change ownership/permissions using your system's normal administration tools
before retrying. Do not select Fluxer AppImage or Flatpak installations: those
formats are not supported in this release.

When replacing a recognized Reflux injection, the GUI asks for confirmation.
The CLI prompts interactively; automation must explicitly set
`FLUXTOP_REPLACE_REFLUX=1`. Replacement restores the selected instance from its
verified original backup before installing Fluxtop, and retains that backup.
On first Fluxtop startup, legacy Reflux settings (including imported plugin
records) are copied into Fluxtop's settings namespace only when no Fluxtop
settings file exists. The original Reflux settings file is never changed or
removed.

Windows x64 portable GUI and CLI installers remain available. Linux x64 builds
provide an AppImage GUI installer and a standalone CLI binary. Linux packaging
is for Fluxtop itself and does not imply support for Fluxer AppImage/Flatpak.
