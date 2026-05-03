# 101 Katman Excel Karsilastirma Calismasi

Bu klasor, `101` katmana ait Excel verisini simulator ile karsilastirmak icin yapilan calismanin tum dosyalarini bir arada tutar.

## Dosyalar

- `_v21-101.xlsx`: Kullanilan kaynak Excel dosyasi
- `extract_excel_layers.py`: Excel satirlarini JSON export dosyasina cevirir
- `layers_1_101_export.json`: Excel'den uretilen ara veri
- `scan_excel_results.js`: Export verisini `battle-core.js` ile tarar ve rapor olusturur
- `101-katman-simulator-karsilastirma-raporu.txt`: 101 katmanin tam detayli karsilastirma raporu
- `101-katman-eslesmeyenler-kisa-liste.txt`: Eslesmeyen 40 katmanin kisa listesi

## Son Ozet

- Toplam katman: `101`
- Tam eslesen sonuc: `61/101`
- Kan kaybi ayni olup kayip profili farkli olan ek kayit: `1`
- Tam eslesmeyen toplam katman: `40`

## Yeniden Calistirma

Bu klasor icinde:

```powershell
& 'C:\Users\YAVUZ\AppData\Local\Programs\Python\Python313\python.exe' .\extract_excel_layers.py
node .\scan_excel_results.js
```

## Not

Raporlarda birlik sirasi normalize edilmistir:

- Dusman: `T1-T10`
- Bizim birlikler: `T1-T8`
