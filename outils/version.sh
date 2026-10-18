#!/bin/sh
# Ajoute un numéro de version aux fichiers du site pour forcer les navigateurs à prendre la dernière version.
V=$(date -u +%Y%m%d%H%M)
sed -i -E "s#(src|href)=\"(app\.js|styles\.css|config\.js)(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" index.html
sed -i -E "s#const CACHE = \"police-management-[^\"]*\";#const CACHE = \"police-management-$V\";#" sw.js
echo "Version $V"
