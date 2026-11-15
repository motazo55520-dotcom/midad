#!/usr/bin/env bash
# الاستخدام:  ./set-domain.sh midad.com
set -e
if [ -z "$1" ]; then echo "اكتب الدومين:  ./set-domain.sh yourdomain.com"; exit 1; fi
D="${1#https://}"; D="${D#http://}"; D="${D%/}"
sed -i.bak "s#YOUR-DOMAIN.com#$D#g" index.html sitemap.xml robots.txt 404.html
echo "$D" > CNAME
rm -f ./*.bak
echo "تم ضبط الدومين على: $D"
