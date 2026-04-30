# Colab Calisma Alani

Bu klasor, Colab ve benzeri dis test/hesaplama entegrasyonlari icin ayrilmis izole calisma alanidir.
Ana proje dosyalariyla karismamasi icin yeni denemeler, scriptler, notlar ve gecici araclar burada tutulur.

## Geri Donus Noktasi

- Aciklama: `colab oncesi calismalar`
- Yerel snapshot: `.backups/colab-oncesi-calismalar-20260430-1112`
- Git backup dali: `backup-colab-oncesi-calismalar-20260430-1112`
- Git backup commit: `d3bcc59`

## Bu Kurulum Ne Yapiyor

Bu klasorde iki parca var:

1. `worker/`
Colab tarafinda calisacak hafif HTTP worker.
Sadece izinli job'lari kosar, ciktilari JSON olarak doner.

2. `client/`
Bu makineden worker'a is gonderen istemci.
Endpoint + token verildiginde job baslatir, bekler ve sonucu kaydeder.

Ilk surumde kurulu gelen job:

- `smoke`
  Colab ortaminda Python surumu, GPU varligi, `nvidia-smi`, repo dosyalari gibi temel saglik kontrolu yapar.
- `optimizer_search`
  Belirli bir battle payload'i icin uzun sureli optimizer aramasi yapar.

Bu iskelet kurulduktan sonra agir battle job'larini ayni protokole baglayacagiz.

## Dosya Yapisi

- `config/remote.example.json`
- `config/stage75-deep-minloss.json`
- `client/submit_job.py`
- `worker/colab_http_worker.py`
- `worker/allowed_jobs.json`
- `jobs/smoke_job.py`
- `jobs/optimizer_search_job.py`
- `jobs/optimizer_search_runner.js`
- `notes/COLAB_BOOTSTRAP.md`
- `notes/SESSION_HANDOFF.md`

## Hedef Is Akisi

1. Sen Colab'da repo'yu acarsin.
2. Worker'i notebook icinde baslatirsin.
3. Worker'i internete acmak icin `cloudflared` veya `ngrok` ile bir URL alirsin.
4. Bu URL ve token'i bana verirsin.
5. Ben bu klasordeki istemciyle job gonderirim.
6. Sonucu yine bu klasorde `runs/` altina alir ve yorumlarim.

## Benden Sonra Senden Gerekecekler

Asagidakilerden birini yapman gerekecek:

### Secenek A: Cloudflared

Login gerekmez.
Genelde en kolay secenek budur.

### Secenek B: Ngrok

Eger `cloudflared` calismazsa `ngrok` auth token ile kullanirsin.

## Bir Sonraki Adimda Senden Isteyecegim Sey

Asagidaki 3 bilgiden biri lazim olacak:

1. Colab worker URL'i
2. Worker token'i
3. Gerekirse `ngrok` auth token ile tunnel acman

Detayli adimlar icin:

- [notes/COLAB_BOOTSTRAP.md](</C:/Users/YAVUZ/Documents/BT-Analyss - v6/colab-workspace/notes/COLAB_BOOTSTRAP.md>)
- [notes/SESSION_HANDOFF.md](</C:/Users/YAVUZ/Documents/BT-Analyss - v6/colab-workspace/notes/SESSION_HANDOFF.md>)

## Yerel Kullanim

Bu makinede Python icin varsayilan komut yerine `py -3` kullan.
Bu not kalici olsun:

- Python komutlari: `py -3 ...`
- Script calistirma: `py -3 colab-workspace\client\submit_job.py ...`
- Derleme/sentaks kontrolu: `py -3 -m py_compile ...`

Ornek:

```powershell
py -3 colab-workspace\client\submit_job.py `
  --endpoint https://ornek.trycloudflare.com `
  --token SENIN_TOKENIN `
  --job smoke `
  --wait `
  --save-dir colab-workspace\runs
```

Var olan bir remote job'i tekrar sorgulamak icin:

```powershell
py -3 colab-workspace\client\submit_job.py `
  --endpoint https://ornek.trycloudflare.com `
  --token SENIN_TOKENIN `
  --job-id REMOTE_JOB_ID `
  --wait `
  --save-dir colab-workspace\runs
```

Bu oturumdaki aktif battle payload'i:

- [config/stage75-deep-minloss.json](</C:/Users/YAVUZ/Documents/BT-Analyss - v6/colab-workspace/config/stage75-deep-minloss.json>)

## Not

Bu noktadan sonra Colab ile ilgili hazirlik ve deneysel dosyalar oncelikle bu klasorde tutulacak.
Gizli ya da oturumluk durum bilgileri icin git'e alinmayan `colab-workspace/LOCAL_STATE.md` kullanilir.
