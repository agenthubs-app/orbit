#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
sed -n '/^private struct WidgetCard</,/^private struct OrbitEntry:/p' "$root/plugins/widgetkit/OrbitWidgetBundle.swift" | sed '$d' > "$scratch/reader.swift"
cat "$root/tests/widget-reader-tombstone.swift" >> "$scratch/reader.swift"
xcrun swiftc -parse-as-library "$scratch/reader.swift" -o "$scratch/reader-test"
"$scratch/reader-test"
