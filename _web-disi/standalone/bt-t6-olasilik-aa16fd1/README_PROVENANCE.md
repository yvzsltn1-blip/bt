Bu klasor, ana projeden bagimsiz deneme yapmak icin `aa16fd1` commit'inden cikartildi.

Kaynak:
- repo: `origin = https://github.com/yvzsltn1-blip/bt.git`
- branch: `t6-t8-investigation`
- commit: `aa16fd12888100d12e5a41f8df7b1abe6ed407f2`
- mesaj: `fix: restore T6 tie-break behavior and show outcome odds`

Bu surum neden secildi:
- T6/Gargoyle davranisina odakli branch uzerindeki net aday commit bu.
- Simulasyon sonrasi coklu seed taramasi ile olasi sonuc dagilimi / outcome odds gosteriyor.
- T6 varken round basi rastgele hiz dusurme mantigi bu snapshot'ta mevcut.

Not:
- Bu klasor bir `git worktree` degil, duz snapshot kopyasidir.
- Buradaki degisiklikler ana proje klasorunu etkilemez.
