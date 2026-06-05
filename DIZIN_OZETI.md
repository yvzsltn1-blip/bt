# Dizin Ozeti

Bu belge, `C:\Users\YAVUZ\Documents\BT-Analyss - v6 - Kopya` dizininin klasor bazli kisa envanteridir.
Canli uygulama dosyalari ayrintili, buyuk yedek/agaclari ise toplulastirilmis olarak ozetlenmistir.

## Kok dizin dosyalari

- `AGENTS.md`: Codex icin calisma ve raporlama kurallari.
- `.firebaserc`: Firebase proje secimi/config baglantisi.
- `.gitignore`: Git disina alinacak dosya ve klasor kurallari.
- `firebase.json`: Hosting ve emulator benzeri Firebase davranis ayarlari.
- `firestore.indexes.json`: Firestore indeks tanimlari.
- `firestore.rules`: Firestore erisim guvenlik kurallari.
- `github-yedekle.bat`: Muhtemelen repo/yedek alma icin Windows batch yardimcisi.
- `site-gate.js`: Sayfa erisim veya ortam kontrol mantigi.
- `styles.css`: Uygulamanin ana stil dosyasi.
- `index.html`: Ana giris/uygulama kabugu.
- `app.js`: Ana istemci uygulama mantigi; en buyuk merkez dosyalardan biri.
- `firebase-client.js`: Firebase istemci entegrasyonu ve veri akislarinin buyuk kismi.
- `admin-auth-ui.js`: Yonetici girisi veya yetkili UI davranislari.
- `archive.html`: Arsiv ekraninin HTML kabugu.
- `archive.js`: Arsiv sayfasi mantigi.
- `saved.html`: Kayitli sonuc/icerik gorunumu.
- `saved.js`: Kayitli sonuc islemleri.
- `wrong.html`: Yanlis/eslesmeyen sonuc ekraninin HTML kabugu.
- `wrong.js`: Yanlis raporlar veya eslesmeyen sonuc mantigi.
- `fav.html`: Favori/secili sonuc gorunumu.
- `fav.js`: Favori ekran davranislari.
- `quick.html`: Hizli kullanim veya hizli aktarim arayuzu.
- `reliability.html`: Guvenilirlik/kalite kontrol sayfasi.
- `reliability.js`: Guvenilirlik olcum ve raporlama mantigi.
- `regression-report.html`: Regresyon raporu ekran sarmali.
- `regression-report.js`: Regresyon raporu olusturma/gosterme kodu.
- `optimizer.html`: Ana optimizer arayuzu.
- `optimizer.js`: Optimizer algoritmasinin ana JavaScript kodu.
- `optimizer-v2.html`: Optimizer icin ikinci arayuz denemesi.
- `optimizer-v2.js`: Optimizer V2 mantigi.
- `optimizer-minimum.html`: Daha sade optimizer arayuzu.
- `skill.html`: Skill/ozellik odakli yardimci ekran.
- `skill.js`: Skill ekraninin istemci mantigi.
- `simulat.js`: Simulasyon akisi veya simulasyon yardimci mantigi.
- `simulation-log-export.js`: Simulasyon loglarini disa aktarma araci.
- `bulk-regression.js`: Toplu regresyon veya toplu karsilastirma scripti.
- `battle-core.js`: Savas hesaplama/kurallarinin ana motoru.
- `battle-core-v2.js`: Savas motorunun alternatif/gelistirilmis varyanti.
- `birlik.user.js`: Tampermonkey/userscript tarzi otomasyon dosyasi.
- `bt-filler.user.js`: Bitefight alanlarini otomatik doldurma userscript'i.
- `BT-Analyss-v6-backup-20260520-202201.zip`: Kok dizinde tutulan tam proje yedegi.

## Ust duzey klasorler

### `.antigravitycli`

- `*.json`: Harici arac veya CLI oturum/metadata kaydi.

### `.backup`

- `BT-Analyss-v6-backup-20260505-180616.zip`: Tek parca eski proje yedegi.

### `.backups`

- Genel amac: Tarihli snapshot, zip ve gecici geri donus noktalarini tutan buyuk yedek agaci.
- Icerik tipleri: `snapshot-*`, `pre-*`, `*.zip`, tekil `*.js` geri donus dosyalari.
- Ornekler:
  - `20260427-pre-t6-t8-debug`: T6/T8 debug oncesi snapshot.
  - `colab-oncesi-calismalar-20260430-1112`: Colab entegrasyonu oncesi donus noktasi.
  - `pre-simulat-engine-20260520-011346`: Simulasyon motoru degisikligi oncesi yedek.
  - `snapshot-*`: Belirli tarihlerde alinan tam veya yari tam durum kopyalari.

### `.claude`

- `settings.local.json`: Claude/Codex benzeri araclar icin yerel ayar dosyasi.

### `.firebase`

- `hosting..cache`: Firebase hosting deploy cache/artifact kaydi.

### `bt-filler-extension`

- `manifest.json`: Chrome extension manifesti; `quick.html` ile Bitefight sayfasi arasinda kopru kuruyor.
- `content-quick.js`: Yerel `quick.html` tarafinda sonuclari okuyan content script.
- `content-bitefight.js`: Bitefight sayfasinda alan doldurma yapan content script.
- `bookmarklet.html`: Extension/bookmarklet kullanimina yardimci mini sayfa.

### `docs`

- `tekilmod-uygulama-notlari.md`: `TekilMod` davranisinin amaci, UI etkisi ve uygulama notlari.
- `superpowers/plans/2026-05-05-firestore-read-optimization.md`: Firestore okuma optimizasyonu icin plan belgesi.
- `superpowers/specs/2026-05-05-firestore-read-optimization-design.md`: Aynı konunun teknik tasarim/spec belgesi.

### `scripts`

- Su an bos gorunuyor; gelecek yardimci scriptler icin ayrilmis klasor.

### `tampermonkey`

- `birlik.js`: Tarayici otomasyonu icin Tampermonkey surumu veya yardimci script.

### `tests`

- `test-unit-names.js`: Birim isimlendirmesi veya map dogrulama testi.
- `test-simulation-log-export.js`: Simulasyon log export davranisini test eder.
- `test-firebase-paged-fallback.js`: Firebase sayfalama/fallback akisini test eder.
- `test-battle-rounding-policy.js`: Savas hesaplarindaki yuvarlama kurallarini test eder.
- `test-battle-log-unit-summary.js`: Savas loglarindaki birlik ozetini test eder.

### `_web-disi`

Bu klasor canli web akisina dahil olmayan arastirma, test, Python, Colab ve yedek materyallerini tutar.

#### `_web-disi/analysis-js`

- `analyze-approved.js`: Onayli veri/sonuc analizi.
- `analyze-hypotheses.js`: Hipotez veri karsilastirma analizi.
- `benchmark-optimizer.js`: Optimizer performans bench scripti.
- `investigate-vs-hypotheses.js`: Inceleme ve hipotez farklarini tarayan analiz scripti.

#### `_web-disi/tests`

- `test-approved-detail.js`: Onayli sonuc detay testleri.
- `test-comprehensive.js`: Daha genis kapsamli toplu test.
- `test-fixes.js`: Yapilan duzeltmelerin regresyon testi.
- `test-firestore-read-optimization.js`: Firestore okuma optimizasyonu testi.
- `test-hipotez-2026-05-01.js`: Hipotez odakli tarihli test.
- `test-rounding-fix.js`: Yuvarlama duzeltmesi testi.
- `test-yanlis-2026-05-01.js`: Yanlis sonuc senaryolari icin test.
- `stage61_fullspace_top100_smoke_test.html`: Smoke test raporunun HTML gorunumu.
- `stage61_fullspace_top100_smoke_test.txt`: Ayni smoke testin metin cikisi.

#### `_web-disi/python`

- `bt.py`: Python tarafindaki temel battle/simulasyon mantigi.
- `bt_gui.py`: Python GUI denemesi veya masaustu arac.
- `simulate_vampire_v5.1.py`: Belirli simulator surumu.
- `simulate_vampire_v5.1.userbattle.tmp.py`: Gecici kullanici battle varyanti.
- `simulate_vampire_update.py`: Simulator guncelleme/deneme scripti.
- `colab_exact_verifier_cell.py`: Colab'da kesin dogrulama hucre/scripti.
- `colab_gpu_outcome_scanner.py`: GPU uzerinde sonuc tarama araci.
- `colab_parallel_verifier.py`: Paralel dogrulama scripti.
- `colab_stage61_fullspace_top100.py`: Stage61 odakli tarama/calculasyon scripti.

#### `_web-disi/scripts`

- `build_report_truth_dataset.py`: Rapor dogruluk veri seti uretir.
- `compare_py_js_datasets.py`: Python ve JS veri setlerini karsilastirir.
- `scan_layers_current_js.js`: Guncel JS katman verisini tarar.
- `scan_layers_python_sim.py`: Python simulasyon katmanlarini tarar.
- `__pycache__/`: Python derlenmis cache ciktilari.

#### `_web-disi/data-dumps`

- `approvedStrategies.firestoredump.json`: Onayli stratejilerin Firestore dump'i.
- `wrongReports.firestoredump.json`: Yanlis raporlarin Firestore dump'i.
- `live_approved_strategies.json`: Canli ortamdan alinmis onayli strateji verisi.
- `live_wrong_reports.json`: Canli yanlis rapor verisi.
- `layers_js_current.json`: Guncel JS katman veri cikisi.
- `layers_py_v51.json`: Python simulator katman veri cikisi.
- `simulate_vampire_v5.1.userbattle.out.txt`: Simulasyon cikti metni.
- `colab_stage5_exact.txt`: Colab exact verification cikisi.
- `sonuc.txt`: Genel sonuc dump'i.
- `stage2-kademe2-705-kombinasyon-sonuclari.txt`: Belirli kombinasyon taramasinin sonucu.

#### `_web-disi/docs`

- `ARASTIRMA-2026-05-01.md`: Arastirma notlari.
- `DEBUG_NOTES_2026-04-30.md`, `DEBUG_NOTES_2026-05-01.md`: Tarihli debug notlari.
- `GARGOYLE_VERSION_DIFF_NOTE.md`: Surum farklari notu.
- `OPTIMIZER_PROGRESS.md`: Optimizer ilerleme gunlugu.
- `SESSION_CHANGES_*.md`: Oturum bazli degisiklik kayitlari.
- `TEST-REPORT.md`: Test sonucu/rapor belgesi.
- `T6_REMAINING_3_CASES_NOTE.md`: Acik kalan T6 vakalari notu.
- `WRONG_BATTLE_DATASET_NOTE.md`: Yanlis battle veri seti notlari.
- `WRONG_REPORT_PERMISSION_DEBUG.md`: Izin/erisim kaynakli debug notu.
- `WRAITH_TARGETING_NOTE.md`: Hedefleme mekanigi notu.

#### `_web-disi/scratch`

- `battle-core.backup.js`: Gecici veya manuel saklanmis battle-core yedegi.

#### `_web-disi/sonuc-arsivi`

- `_v21-101.xlsx`: Sonuc karsilastirma icin Excel arsivi.
- `extract_excel_layers.py`: Excel'den katman verisi cikarir.
- `scan_excel_results.js`: Excel kaynakli sonucu tarar.
- `layers_1_101_export.json`: Excel'den disa alinmis katman verisi.
- `101-katman-calisma-notu.md`: 101 katmanli calisma notlari.
- `101-katman-eslesmeyenler-kisa-liste.txt`: Eslesmeyen sonuclarin kisa listesi.
- `101-katman-simulator-karsilastirma-raporu.txt`: Simulator karsilastirma raporu.
- `dogru_1.txt`: Dogru ornekler.
- `yanlis_1.txt`: Yanlis ornekler.

#### `_web-disi/standalone`

- `bt-t6-olasilik-aa16fd1/`: Ayrik bir standalone calisma kopyasi.
- Icerik: `app.js`, `battle-core.js`, `optimizer.js`, `firebase-client.js`, `styles.css`, `wrong.*`, `saved.*`, `index.html` gibi ana uygulama dosyalarinin donmus kopyalari.
- Ek notlar: `README_PROVENANCE.md`, `OPTIMIZER_PROGRESS.md`, `WRAITH_TARGETING_NOTE.md`, `GARGOYLE_VERSION_DIFF_NOTE.md`.
- Yardimci Python/Colab dosyalari da bu klasorde yeniden tutuluyor.

#### `_web-disi/colab-workspace`

- `README.md`: Colab entegrasyonunun mimarisi ve geri donus noktasi.
- `LOCAL_STATE.md`: Yerel durum/elde kalan baglam notu.
- `client/submit_job.py`: Uzak worker'a is gonderen istemci.
- `worker/colab_http_worker.py`: Izinli job'lari kosan hafif HTTP worker.
- `worker/allowed_jobs.json`: Kosulabilecek job listesi.
- `jobs/*.py`, `jobs/*.js`: Smoke, optimizer search, surrogate train/dataset, mechanic sweep, report-risk gibi job tanimlari ve runner'lari.
- `config/*.json`: Remote, training ve stage konfigurasyonlari.
- `notes/*.md`: Colab bootstrap, handoff ve risk plan notlari.
- `data/report-truth/*`: Rapor dogruluk veri setleri.
- `runs/*`: Egitim ciktilari, job kayitlari, smoke sonuc dosyalari.

#### `_web-disi/local-backups`

- Genel amac: Ozellikle belirli degisikliklerden once alinmis kucuk kapsamli yerel snapshot'lar.
- `pre-bulk-regression-20260430-2205/`: Bulk regression oncesi proje kopyasi; ana JS/HTML/Python/test dosyalari bulunuyor.
- `pre-firestore-read-optimization-20260505/`: Firestore okuma optimizasyonu oncesi durum; `files/`, `tracked.diff`, `git-status.txt`, `BACKUP_NOTE.md` iceriyor.
- `pre-halfscreen-fix-20260525-153711/`: Yarim ekran duzeltmesi oncesi `styles.css` ve optimizer sayfalari.
- `pre-log-export-buttons-20260502-110308/`: Log export dugmeleri oncesi kopya; script, veri ve diff dosyalari var.
- `quick-fullwidth-20260525-194500/`: `quick.html` tam genislik degisikligi oncesi snapshot.

## Genel yorum

- Canli uygulama agirlikli dosyalar kok dizinde.
- Arastirma, deneysel Python/Colab ve eski snapshot'lar buyuk olcude `_web-disi` ve `.backups` altina toplanmis.
- `scripts/` disinda klasor adlandirmasi genel olarak amac odakli; buyukluk esas olarak yedek klasorlerinden geliyor.
