#!/bin/sh
# Install or update the Observatory on the Quavsit host. Run as root from a checkout.
# The code runs from a root-owned copy (/opt/quavsit-observatory): nothing the repository
# receives changes what runs here, and the host holds no GitHub credential.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
install -d -o root -g root -m 0755 /opt/quavsit-observatory
install -d -o marl -g marl -m 0700 /var/lib/quavsit/observatory-data
install -d -o marl -g marl -m 0755 /var/www/dl/observatory
rm -rf /opt/quavsit-observatory/observatory
cp -R "$src/observatory" /opt/quavsit-observatory/
chown -R root:root /opt/quavsit-observatory && chmod -R a+rX,go-w /opt/quavsit-observatory
for unit in quavsit-observatory-sample.service quavsit-observatory-sample.timer \
            quavsit-observatory-publish@.service quavsit-observatory-publish-today.timer \
            quavsit-observatory-publish-yesterday.timer; do
  install -o root -g root -m 0644 "$src/deploy/$unit" /etc/systemd/system/$unit
done
systemctl daemon-reload
echo "Installed. Data: /var/lib/quavsit/observatory-data; export: /var/www/dl/observatory (https://dl.quavern.net/observatory/data.tar.gz)."
echo "Enable with: systemctl enable --now quavsit-observatory-sample.timer quavsit-observatory-publish-today.timer quavsit-observatory-publish-yesterday.timer"
