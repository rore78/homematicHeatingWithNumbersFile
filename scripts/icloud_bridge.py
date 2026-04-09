#!/usr/bin/env python3
"""
iCloud Bridge Script fuer Homematic IP Addon.
Wird von Node.js via child_process aufgerufen.
Kommuniziert via JSON auf stdout.
"""

import argparse
import json
import os
import sys


def output(data):
    print(json.dumps(data, default=str))
    sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="iCloud Bridge")
    parser.add_argument("--action", required=True,
                        choices=["login", "verify-2fa", "list", "download", "status"])
    parser.add_argument("--apple-id", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--code", default="")
    parser.add_argument("--path", default="/")
    parser.add_argument("--output", default="")
    parser.add_argument("--session-dir", default="icloud-session")
    args = parser.parse_args()

    try:
        from pyicloud import PyiCloudService
        from pyicloud.exceptions import (
            PyiCloudFailedLoginException,
            PyiCloudAPIResponseException,
        )
    except ImportError:
        output({"status": "error", "message": "pyicloud nicht installiert. Bitte: pip3 install pyicloud"})

    # Session-Verzeichnis erstellen
    os.makedirs(args.session_dir, exist_ok=True)

    try:
        if args.action == "login":
            if not args.apple_id or not args.password:
                output({"status": "error", "message": "Apple-ID und Passwort erforderlich."})
            api = PyiCloudService(
                args.apple_id, args.password,
                cookie_directory=args.session_dir
            )
            if api.requires_2fa:
                output({"status": "2fa_required", "message": "Bestaetigungscode wurde an Ihre Apple-Geraete gesendet."})
            else:
                output({"status": "ok"})

        elif args.action == "verify-2fa":
            if not args.code:
                output({"status": "error", "message": "2FA-Code erforderlich."})
            # Session laden
            api = PyiCloudService(
                cookie_directory=args.session_dir
            )
            result = api.validate_2fa_code(args.code)
            if result:
                api.trust_session()
                output({"status": "ok", "session_valid": True})
            else:
                output({"status": "error", "message": "Ungueltiger Code."})

        elif args.action == "list":
            api = PyiCloudService(cookie_directory=args.session_dir)
            if api.requires_2fa:
                output({"status": "reauth_required", "message": "Session abgelaufen."})

            drive = api.drive
            folder = drive
            if args.path and args.path != "/":
                for part in args.path.strip("/").split("/"):
                    folder = folder[part]

            files = []
            for item in folder.dir():
                node = folder[item]
                name = node.name if hasattr(node, "name") else item
                ext = os.path.splitext(name)[1].lower()
                if ext not in (".xlsx", ".xls", ".numbers"):
                    continue
                files.append({
                    "name": name,
                    "path": f"{args.path.rstrip('/')}/{name}",
                    "size": getattr(node, "size", 0) or 0,
                    "modified": str(getattr(node, "date_modified", None))
                })
            output({"status": "ok", "files": files})

        elif args.action == "download":
            if not args.path or not args.output:
                output({"status": "error", "message": "Pfad und Ausgabedatei erforderlich."})
            api = PyiCloudService(cookie_directory=args.session_dir)
            if api.requires_2fa:
                output({"status": "reauth_required", "message": "Session abgelaufen."})

            drive = api.drive
            parts = args.path.strip("/").split("/")
            folder = drive
            for part in parts[:-1]:
                folder = folder[part]
            file_node = folder[parts[-1]]
            with file_node.open(stream=True) as response:
                with open(args.output, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
            size = os.path.getsize(args.output)
            output({"status": "ok", "path": args.output, "size": size})

        elif args.action == "status":
            try:
                api = PyiCloudService(cookie_directory=args.session_dir)
                if api.requires_2fa:
                    output({"status": "ok", "authenticated": False})
                # Test drive access
                _ = api.drive.dir()
                output({"status": "ok", "authenticated": True})
            except Exception:
                output({"status": "ok", "authenticated": False})

    except PyiCloudFailedLoginException:
        output({"status": "error", "message": "Anmeldung fehlgeschlagen. Bitte Apple-ID und Passwort pruefen."})
    except PyiCloudAPIResponseException as e:
        if "session" in str(e).lower():
            output({"status": "reauth_required", "message": "Session abgelaufen."})
        else:
            output({"status": "error", "message": str(e)})
    except Exception as e:
        output({"status": "error", "message": f"Unbekannter Fehler: {str(e)}"})


if __name__ == "__main__":
    main()
