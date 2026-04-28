## Snapshot

Bu klasor, `2026-04-29 02:20:00` itibariyla calisan savas motoru durumunun geri donus kopyasidir.

Icerik:
- `battle-core.js`
- `index.html`
- `optimizer.html`
- `saved.html`
- `wrong.html`

Bu snapshot'ta yapilmis ana degisiklikler:
- `T6 / Gargoyl` davranisi `reactive-only` yapildi.
- Raund basi rastgele dusman hiz dusurme kaldirildi.
- Gargoyle'e saldiran dusman birimin hizi `-2` olacak sekilde reactive slow korundu.
- Reactive slow sonrasi ayni raundda saldiri sirasinin tekrar kurulmasindan dogan `ayni birimin iki kez vurmasi` hatasi duzeltildi.
- Sayfalardaki script referanslari yeni motoru yukleyecek sekilde cache-busting ile guncellendi:
  - `battle-core.js?v=20260429-01`

Bu snapshot alindiginda bilinen durum:
- `saved.html` tarafindaki onayli kayitlar mevcut motorla uyumlu.
- `wrong.html` tarafinda tek bir global mantik hatasiyla aciklanamayan ayri vaka gruplari var.
- `Zombie Resurrection` ve bazi rounding/tie-break davranislari hala arastirma konusu olabilir.

Geri donus:

```powershell
$src = '.backups\snapshot-reactive-only-live-20260429-022000'
Copy-Item -LiteralPath "$src\battle-core.js","$src\index.html","$src\optimizer.html","$src\saved.html","$src\wrong.html" -Destination "." -Force
```

Canliya geri almak gerekirse bu dosyalar geri kopyalandiktan sonra hosting tekrar deploy edilmelidir.
