# TidGi Official Website

## Design Priciple

- En el directorio de archivos de la barra lateral, organice diferentes entradas por idioma para facilitar el cambio de idioma.
- Personaliza las entradas de Taiwei y colocalas tiddlywiki En la entrada (anadir tiddlywiki El significado de la etiqueta）

## Related Discussion

- [How to create product website using tw? (Like apple.com)](https://talk.tiddlywiki.org/t/how-to-create-product-website-using-tw-like-apple-com)

## DLC

Use [scripts/download-installers.mjs](scripts/download-installers.mjs) to download installer exe/zip/dmg to `files/downloaders`.

Binary files in `files/downloaders` should be gitignored, because files are large and updated frequently. When setup website on a server, please use things like `pm2` to run the download-installers script periodically.

The downloader uses `socks5h://127.0.0.1:1080` by default. Override it with `DOWNLOAD_PROXY`, or set `DOWNLOAD_PROXY=direct` to disable proxy usage. It cleans `files/downloaders` by default; set `DOWNLOAD_CLEAN=false` to resume partial `.download` files.
