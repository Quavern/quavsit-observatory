#!/bin/sh
# Install or update the Observatory on the Quavsit host. Run as root from a checkout.
# The code runs from a root-owned copy (/opt/quavsit-observatory), never from the data
# checkout the job pushes to, so a push to the repository cannot change what runs here.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
install -d -o root -g root -m 0755 /opt/quavsit-observatory /etc/quavsit
rm -rf /opt/quavsit-observatory/observatory
cp -R "$src/observatory" /opt/quavsit-observatory/
chown -R root:root /opt/quavsit-observatory && chmod -R a+rX,go-w /opt/quavsit-observatory
for unit in quavsit-observatory-sample.service quavsit-observatory-sample.timer \
            quavsit-observatory-publish@.service quavsit-observatory-publish-today.timer \
            quavsit-observatory-publish-yesterday.timer; do
  install -o root -g root -m 0644 "$src/deploy/$unit" /etc/systemd/system/$unit
done
systemctl daemon-reload
echo "Installed. Deploy key: /etc/quavsit/observatory-deploy.key (marl, 0600); data checkout: /var/lib/quavsit/observatory-repo."
echo "Enable with: systemctl enable --now quavsit-observatory-sample.timer quavsit-observatory-publish-today.timer quavsit-observatory-publish-yesterday.timer"
