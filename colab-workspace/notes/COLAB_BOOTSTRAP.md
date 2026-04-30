# Colab Bootstrap

Bu not, Colab tarafinda worker'i ayaga kaldirmak icin gereken minimum adimlari anlatir.

## Yerel Not

Bu Windows makinede Python komutlari icin `python` yerine `py -3` kullan.
Sonraki tum yerel orneklerde bu tercih edilmeli.

## 1. Colab'da Repo'yu Ac

Notebook icinde repo'yu bir klasore cek:

```python
!git clone https://github.com/yvzsltn1-blip/bt.git
%cd bt
```

Eger backup/work branch'lerini de kullanacaksan:

```python
!git fetch --all
!git switch work-colab-hazirlik-20260430
```

## 2. Token Belirle

Kolay bir token sec:

```python
WORKER_TOKEN = "buraya-uzun-bir-token-yaz"
```

Bu token'i bana ayrica vereceksin.

## 3. Worker'i Baslat

Notebook hucresinde:

```python
!python colab-workspace/worker/colab_http_worker.py --host 0.0.0.0 --port 8787 --token "$WORKER_TOKEN"
```

Bu hucre worker ayakta kaldigi surece acik kalir.

## 4. Tunnel Ac

### Secenek A: Cloudflared

Genelde login istemez.

```python
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
!chmod +x cloudflared
!nohup ./cloudflared tunnel --url http://127.0.0.1:8787 > cloudflared.log 2>&1 &
!grep -o "https://[-0-9a-z]*\.trycloudflare.com" -m 1 cloudflared.log || cat cloudflared.log
```

Buradan cikan URL'i bana gondereceksin.

### Secenek B: Ngrok

Eger Cloudflared olmazsa:

```python
!pip install -q pyngrok
```

Sonra `NGROK_AUTHTOKEN` gir:

```python
from pyngrok import ngrok
ngrok.set_auth_token("BURAYA_NGROK_TOKEN")
public_url = ngrok.connect(8787, "http").public_url
print(public_url)
```

## 5. Health Kontrolu

Notebook veya baska bir hucreden:

```python
import requests
requests.get("WORKER_URL/health").json()
```

`WORKER_URL` yerine aldigin tunnel URL'ini koy.

## 6. Bana Verecegin Sey

- Worker URL
- Worker token

Bundan sonra ben bu makineden su komutla smoke test gonderebilirim:

```powershell
py -3 colab-workspace\client\submit_job.py --endpoint WORKER_URL --token WORKER_TOKEN --job smoke --wait
```

## Ilk Beklenen Test

Ilk olarak `smoke` job'unu calistiracagim.
Bu test su konulari dogrular:

- Colab ortami acik mi
- GPU gorunuyor mu
- Repo dogru yerde mi
- Worker cevap veriyor mu
- Sonuclar bu makineye alinabiliyor mu

## Sonraki Asama

Smoke gectikten sonra agir battle job'lari ekleyecegim.
O noktada ayni worker uzerinden daha spesifik test tipleri calistiracagiz.
