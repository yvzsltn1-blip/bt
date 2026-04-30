# Colab Handoff

Bu not, terminal kapanip tekrar acildiginda Colab entegrasyonu ve aktif battle aramasi icin hizli geri donus noktasi olsun diye tutuluyor.

## Ne Yapildi

- `saved.html` ve `wrong.html` icin toplu regresyon/test akisi eklendi.
- Seed olmayan kayitlar icin orneklem bazli fallback eklendi.
- `colab-workspace/` altinda izole bir Colab entegrasyon alani olusturuldu.
- Colab tarafinda calisan HTTP worker, yerelden job gonderebilen istemci ve ilk `smoke` job'i yazildi.
- Colab worker ile baglanti test edildi; `smoke` job basariyla calisti.
- Simdi ikinci adima gecildi: belirli bir versus icin uzun suren optimizer aramasini Colab uzerinde kosturmak.

## Bu Dosyalar Ne Icin

- `colab-workspace/worker/colab_http_worker.py`
  Colab icinde calisan HTTP worker.
- `colab-workspace/client/submit_job.py`
  Yerelden job gonderir veya var olan job'i sorgular.
- `colab-workspace/jobs/smoke_job.py`
  Colab ortami ayakta mi diye kontrol eder.
- `colab-workspace/jobs/optimizer_search_job.py`
  Python wrapper; Node runner'i cagirir.
- `colab-workspace/jobs/optimizer_search_runner.js`
  `battle-core.js` uzerinden gercek optimizer search isini yapar.
- `colab-workspace/LOCAL_STATE.md`
  Bilerek git'e alinmayan yerel durum dosyasi. Worker URL, token, aktif job id gibi gizli/oturumluk bilgiler burada tutulur.

## Aktif Hedef

Asagidaki battle icin en iyi dizilimi bulmak:

- Payload dosyasi: [config/stage75-deep-minloss.json](</C:/Users/YAVUZ/Documents/BT-Analyss - v6/colab-workspace/config/stage75-deep-minloss.json>)

- Stage: `75`
- Mod: `deep`
- Objective: `min_loss`
- Stone mode: `false`
- Diversity mode: `false`

Ally pool:

- `bats=111`
- `ghouls=111`
- `thralls=90`
- `banshees=95`
- `necromancers=33`
- `gargoyles=44`
- `witches=9`
- `rotmaws=0`

Enemy:

- `skeletons=16`
- `zombies=11`
- `cultists=20`
- `bonewings=23`
- `corpses=8`
- `wraiths=4`
- `revenants=12`
- `giants=5`
- `broodmothers=5`
- `liches=3`

## Devam Ederken Ilk Bakilacak Yerler

1. `colab-workspace/LOCAL_STATE.md`
   Burada gecerli worker URL, token, aktif job id ve son komutlar tutulur.
2. `git status --short`
   Yerelde commit edilmemis ne kalmis gor.
3. `colab-workspace/runs/`
   Yerelde kaydedilmis submit / query sonuclari burada olur.

## Tipik Komutlar

Yeni job gondermek:

```powershell
py -3 colab-workspace\client\submit_job.py `
  --endpoint https://WORKER_URL `
  --token WORKER_TOKEN `
  --job optimizer_search `
  --args-json "{...}" `
  --save-dir colab-workspace\runs
```

Mevcut job'i sorgulamak:

```powershell
py -3 colab-workspace\client\submit_job.py `
  --endpoint https://WORKER_URL `
  --token WORKER_TOKEN `
  --job-id JOB_ID `
  --wait `
  --save-dir colab-workspace\runs
```

## Not

- Bu battle aramasi Colab'da uzaktan kosturulacak. Yerel terminal kapanabilir; tekrar geldiginde `LOCAL_STATE.md` + `submit_job.py --job-id ...` ile durum okunabilir.
- `py` komutu bu makinede `py -3` olarak kullanilmali.
