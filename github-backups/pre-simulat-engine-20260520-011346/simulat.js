document.addEventListener("DOMContentLoaded", () => {
  const c =["Bats", "Ghouls", "Vampire Thralls", "Banshees", "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"];
  const m =["Rats", "Flesh Golems", "Wolf Thralls", "Wendigos", "Voodoo Priests", "Chimeras", "Moon Witches", "Hellmaws"];
  let h = "vampire";
  let l = false;
  let b = false;
  const U = 0, P = 1, _ = 2, D = 3, ne = 4, le = 5, re = 6, H = 7;
  const e = 8, G = 9, g = 10, W = 11, se = 12, V = 13, oe = 14, j = 15, M = 16, de = 17, z = 18;
  const J =[2, 5, 6, 4, 5, 12, 8, 90, 4, 7, 1, 3, 10, 2, 12, 25, 18, 25, 1];
  const ue =[8, 3, 6, 7, 9, 12, 14, 30, 3, 2, 5, 6, 1, 7, 8, 10, 9, 40, 1];
  const $ =[5, 2, 4, 4, 2, 3, 3, 1, 3, 2, 1, 4, 1, 4, 4, 1, 2, 3, 6];
  const Y =[1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9];
  const ce =[0, 0, 1, 2, 1, 2, 1, 2, 0, 0, 1, 1, 2, 1, 0, 2, 2, 1, 2];
  const me =[[1, 1.5, .5],[.5, 1, 1.5],[1.5, .5, 1]];
  const Z =[1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
  const K =[1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const y =[2, 3, 4, 7, 10, 15, 18, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const L =[10, 15, 20, 35, 50, 75, 90, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const X = new Int32Array(19);
  const p = new Int32Array(19);
  const q = new Int32Array(19);
  const Q = new Uint8Array(19);
  const ee = new Uint8Array(19);
  const te = new Int32Array(19);
  let ie = false;
  let fe = 0;
  function ae(e) {
    if (e === G && ie)return Math.ceil(X[e]);
    return Math.ceil(X[e] / J[e])
  }
  const v =[{
    id: "e1", t: "vanguard"
  },
  {
    id: "e2", t: "vanguard"
  },
  {
    id: "e3", t: "rearguard"
  },
  {
    id: "e4", t: "rearguard"
  },
  {
    id: "e5", t: "vanguard"
  },
  {
    id: "e6", t: "rearguard"
  },
  {
    id: "e7", t: "vanguard"
  },
  {
    id: "e8", t: "vanguard"
  },
  {
    id: "e9", t: "rearguard"
  },
  {
    id: "e10", t: "rearguard"
  }];
  const I =[{
    id: "a1", i: 1, weight: 2, t: "rearguard"
  },
  {
    id: "a2", i: 2, weight: 3, t: "vanguard"
  },
  {
    id: "a3", i: 3, weight: 4, t: "vanguard"
  },
  {
    id: "a4", i: 4, weight: 7, t: "rearguard"
  },
  {
    id: "a5", i: 5, weight: 10, t: "rearguard"
  },
  {
    id: "a6", i: 6, weight: 15, t: "vanguard"
  },
  {
    id: "a7", i: 7, weight: 18, t: "rearguard"
  },
  {
    id: "a8", i: 8, weight: 30, t: "vanguard"
  }];
  function i() {
    v.forEach(e => {
      let t = document.getElementById(e.id);
      if (t) {
        let e = t.closest(".unit-card");
        if (parseInt(t.value) > 0)e.classList.add("active-card");
        else e.classList.remove("active-card")
      }
    });
    I.forEach(e => {
      let t = document.getElementById("chk_" + e.id);
      if (t) {
        let e = t.closest(".unit-card");
        if (t.checked)e.classList.add("active-card");
        else e.classList.remove("active-card")
      }
    })
  }
  function a(e, f) {
    document.querySelectorAll(`.btn-filter-${e}`).forEach(e => e.classList.remove("active"));
    document.getElementById(`btn-${e}-${f}`).classList.add("active");
    let t = e === "enemies"?v: I;
    t.forEach(t => {
      let i = document.getElementById(t.id);
      if (i) {
        let e = i.closest(".unit-card");
        if (f === "all" || t.t === f) {
          e.style.display = "block"
        }
        else {
          e.style.display = "none"
        }
      }
    })
  }
  function r() {
    let t = {
      l: document.getElementById("layerInput").value, race: h, o:  {
      }
    };
    let e = document.querySelectorAll(".unit-count-input, .unit-checkbox, .unit-max-input");
    e.forEach(e => {
      t.o[e.id] = e.type === "checkbox"?e.checked: e.value
    });
    localStorage.setItem("ruinsHelperState", JSON.stringify(t));
    i()
  }
  function n() {
    let e = localStorage.getItem("ruinsHelperState");
    if (e) {
      let i = JSON.parse(e);
      if (i.l)document.getElementById("layerInput").value = i.l;
      if (i.race)t(i.race);
      else t("vampire");
      if (i.o) {
        for (let t in i.o) {
          let e = document.getElementById(t);
          if (e) {
            if (e.type === "checkbox")e.checked = i.o[t];
            else e.value = i.o[t]
          }
        }
      }
    }
    else {
      t("vampire")
    }
    i();
    document.querySelectorAll(".unit-checkbox, .unit-max-input").forEach(e => {
      e.addEventListener("change", r)
    })
  }
  function t(e) {
    h = e;
    document.getElementById("btn-vampire").classList.remove("active");
    document.getElementById("btn-werewolf").classList.remove("active");
    document.getElementById("btn-" + e).classList.add("active");
    let f = e === "vampire"?"1": "2";
    let a = e === "vampire"?c: m;
    for (let i = 1;i <= 8;i++) {
      let e = document.getElementById(`img_a${i}`);
      if (e)e.src = `./img/Tier${i}_Frame-B-1_${f}.jpg`;
      let t = document.getElementById(`name_a${i}`);
      if (t)t.innerText = a[i - 1]
    }
    document.querySelectorAll(".dyn-name").forEach(e => {
      let t = parseInt(e.getAttribute("data-tier"));
      if (t >= 1 && t <= 8)e.innerText = a[t - 1]
    });
    document.querySelectorAll(".dyn-img").forEach(e => {
      let t = parseInt(e.getAttribute("data-tier"));
      if (t >= 1 && t <= 8) {
        e.src = `./img/Tier${t}_Frame-B-1_${f}.jpg`;
        e.title = a[t - 1]
      }
    });
    r()
  }
  function s(e) {
    let t = document.getElementById("layerInput");
    let i = parseInt(t.value) || 1;
    i += e;
    if (i > 101)i = 101;
    if (i < 1)i = 1;
    t.value = i;
    f()
  }
  function f() {
    let e = document.getElementById("layerInput");
    let t = parseInt(e.value) || 1;
    if (t > 101) {
      t = 101;
      e.value = 101
    }
    if (t < 1) {
      t = 1;
      e.value = 1
    }
    let a = 10 + t * 10;
    let n = 0;
    I.forEach(e => n +=(parseInt(document.getElementById(e.id).value) || 0) * e.weight);
    if (n > a) {
      for (let f = I.length - 1;f >= 0;f--) {
        let e = I[f];
        let t = document.getElementById(e.id);
        let i = parseInt(t.value) || 0;
        while (i > 0 && n > a) {
          i--;
          n -= e.weight
        }
        t.value = i;
        if (n <= a)break
      }
    }
    o();
    r()
  }
  function o() {
    let t = 0;
    I.forEach(e => t +=(parseInt(document.getElementById(e.id).value) || 0) * e.weight);
    document.getElementById("allyStr").innerText = t;
    document.getElementById("maxStrAlly").innerText = 10 +(parseInt(document.getElementById("layerInput").value) || 1) * 10;
    r()
  }
  function d(n) {
    let l = document.getElementById(n);
    if (!l)return;
    let r = parseInt(l.value) || 0;
    if (r < 0)r = 0;
    l.value = r;
    let s = I.find(e => e.id === n);
    if (s) {
      let e = parseInt(document.getElementById("layerInput").value) || 1;
      if (e > 101)e = 101;
      if (e < 1)e = 1;
      let t = 10 + e * 10;
      let i = 0;
      I.forEach(e => {
        if (e.id !== n)i +=(parseInt(document.getElementById(e.id).value) || 0) * e.weight
      });
      let f = t - i;
      let a = Math.floor(f / s.weight);
      if (r > a)l.value = Math.max(0, a)
    }
    o();
    i()
  }
  function u(e, t) {
    let i = document.getElementById(e);
    let f =(parseInt(i.value) || 0) + t;
    i.value = f < 0?0: f;
    d(e)
  }
  function w(f, S, A = false, e = 0) {
    let T =[];
    let k = 1, R = 0;
    ie = false;
    let N = 0, O = 0;
    let t = h === "vampire"?"1": "2";
    let i = h === "vampire"?c: m;
    const a =[i[0], i[1], i[2], i[3], i[4], i[5], i[6], i[7], "Skeleton", "Zombie", "Undead Cultist", "Bonewing", "Bloated Corpse", "Wraith", "Revenant", "Bone Giant", "Broodmother", "Lich", "Spiderling"];
    function F(e) {
      if (K[e])return`<span class="dyn-name" data-tier="${Y[e]}">${a[e]}</span>`;
      return a[e]
    }
    function E(e) {
      if (K[e])return`<img src="./img/Tier${Y[e]}_Frame-B-1_${t}.jpg" class="img-log dyn-img" data-tier="${Y[e]}" title="${a[e]}">`;
      if (e === z)return`<img src="./img/enemyUnit_9.1.png" class="img-log" title="Spiderling">`;
      return`<img src="./img/enemyUnit_${Y[e]}.jpg" class="img-log" title="${a[e]}" onerror="this.src='https://via.placeholder.com/45x55/222/ff4d4d?text=${a[e]}'">`
    }
    for (let e = 0;e < 19;e++) {
      X[e] = 0;
      p[e] = 0;
      q[e] = $[e];
      Q[e] = 0;
      ee[e] = 1;
      te[e] = 0
    }
    for (let e = 0;e < 8;e++) {
      if (f[e] > 0) {
        p[e] = f[e];
        X[e] = f[e] * J[e];
        ee[e] = 0;
        N++
      }
    }
    for (let e = 0;e < 10;e++) {
      if (S[e] > 0) {
        p[8 + e] = S[e];
        X[8 + e] = S[e] * J[8 + e];
        ee[8 + e] = 0;
        O++
      }
    }
    fe = p[G];
    let C =[];
    let B = 1;
    while (N > 0 && O > 0 && k <= 50) {
      if (!A)T.push(`\n<div style="color:#f1fa8c; font-weight:bold; font-size:14px; margin-top:10px;">--- ROUND ${k} ---</div>`);
      C =[];
      let i = new Int32Array(19);
      for (let e = 0;e < 19;e++) {
        if (X[e] > 0) {
          C.push(e)
        }
        i[e] = ae(e)
      }
      C.sort((e, t) => {
        if (q[e] !== q[t])return q[t] - q[e];
        if (Z[e] !== Z[t])return Z[t] - Z[e];
        if (K[e] !== K[t])return K[t] - K[e];
        if (i[e] !== i[t])return i[t] - i[e];
        return Y[t] - Y[e]
      });
      for (let e = 0;e < C.length;e++) {
        let r = C[e];
        if (X[r] <= 0)continue;
        let f = X[oe] > 0;
        let s = K[r];
        let t = s?8: 0;
        let i = s?19: 8;
        let a =[];
        for (let e = t;e < i;e++) {
          if (X[e] > 0)a.push(e)
        }
        if (a.length === 0)break;
        let n = 0;
        if (r === W || r === D) {
          if (a.some(e => Z[e] === 1))n = 1
        }
        let o = a.filter(e => Z[e] === n);
        if (o.length === 0)o = a;
        o.sort((e, t) => {
          if (q[e] !== q[t])return q[e] - q[t];
          let i = ae(e);
          let f = ae(t);
          if (i !== f)return f - i;
          return Y[e] - Y[t]
        });
        let l = o[0];
        let d = ae(r);
        let u = ae(l);
        let c = ue[r] * d;
        let m = 1;
        let h = F(r);
        let p = F(l);
        let g =[];
        if (r === D || r === W) {
          g.push(`- ${h} bypass front units and attack rear units.`)
        }
        if (f && s && Z[r] === 1) {
          g.push(`- Revenants reduce ${h} damage by -15%.`)
        }
        if (A && !s) {
          m *= B
        }
        let M = me[ce[r]][ce[l]];
        if (l === P || r === V || r === H || r === z || l === z) {
          M = 1;
          g.push(`- ${h} ignore unit typing.`)
        }
        else {
          if (M === 1.5)g.push(`- ${h} have type advantage against ${p} and gain +50% damage increase.`);
          else if (M === .5)g.push(`- ${h} have type disadvantage against ${p} and gain -50% damage reduction.`)
        }
        m *= M;
        if (r === U && k === 1) {
          m *= 1.25;
          g.push(`- ${h} attack with +25% damage increase in first round.`)
        }
        if (r === _ && q[l] < 3) {
          m *= 1.33;
          g.push(`- ${h} attack slow unit with +33% damage increase.`)
        }
        let $ = C.find(e => X[e] > 0);
        if ((r === W || r === D) && r === $) {
          m *= 1.2;
          g.push(`- ${h} deal 20% more damage for attacking first.`)
        }
        if (r === ne && R > 0) {
          m *= 1 + .1 * R;
          g.push(`- ${h} gain +${R*10}% damage increase for eliminated units.`)
        }
        if (r === V) {
          let e = Math.floor(u / d);
          if (e >= 2) {
            m *= 1 +(e - 1) * .5;
            g.push(`- ${h} gain +${(e-1)*50}% damage increase from outnumbering.`)
          }
        }
        let y = 1;
        if (r === j) {
          y = 1 + .05 * te[r];
          m *= y;
          if (te[r] > 0) {
            g.push(`- ${h} gain +${te[r]*5}% damage increase from being attacked.`)
          }
        }
        if (r === D || r === W) {
          g.push(`- ${h} reduce ${p} damage by -25% for this round.`)
        }
        if (Q[r]) {
          m *= .75;
          g.push(`- ${h} attack with -25% damage reduction.`)
        }
        if (f && s && Z[r] === 1) {
          m *= .85
        }
        if (l === P) {
          m *= .5;
          g.push(`- ${p} suffer 50% less damage from all attacks.`)
        }
        if (!s && B > 1) {
          g.push(`- Undead Cultists boost ${h} damage by +${Math.round((B-1)*100)}%.`)
        }
        let L = Math.round(c * m);
        let b = 0;
        let v = 0;
        if (r === re && k % 2 === 0) {
          v = Math.round(L * .25)
        }
        if (!A) {
          let e = E(r);
          let t = E(l);
          T.push(`<span style="display:inline-flex; align-items:center; font-weight:bold; gap:4px;">[${s?"ALLY":"ENEMY"}] ${e} x ${d} attacks ${t} x ${u}</span>`);
          g.forEach(e => T.push(`   ${e}`));
          T.push(`   -> ${h} Base DMG: ${c} | ${p} HP: ${X[l]}`);
          let i = `${c}`;
          if (M === 1 &&(l === P || r === V || r === H || r === z || l === z))i += ` * 1.0 (Type Ignored)`;
          else if (M !== 1)i += ` * ${M} (Type)`;
          if (r === U && k === 1)i += ` * 1.25 (T1 Bonus)`;
          if (r === _ && q[l] < 3)i += ` * 1.33 (T3 Bonus)`;
          if ((r === W || r === D) && r === $)i += ` * 1.20 (Ambush)`;
          if (r === ne && R > 0)i += ` * ${(1+.1*R).toFixed(2)} (Reaper)`;
          if (r === V && Math.floor(u / d) >= 2)i += ` * ${(1+(Math.floor(u/d)-1)*.5).toFixed(2)} (Target Wraith Stack)`;
          if (r === j && y > 1)i += ` * ${y.toFixed(2)} (Giant Stacks)`;
          if (A && !s && B > 1)i += ` * ${B.toFixed(2)} (Cultist Stress)`;
          if (Q[r])i += ` * 0.75 (T4 Cripple)`;
          if (f && s && Z[r] === 1)i += ` * 0.85 (Revenant Aura)`;
          if (l === P)i += ` * 0.50 (T2 Shield)`;
          i += ` = ${L} DMG`;
          T.push(`   -> Formula: ${i}`)
        }
        let I = L;
        let w = 0;
        let x = null;
        for (let l = 0;l < o.length;l++) {
          let e = o[l];
          if (X[e] <= 0)continue;
          let t = ae(e);
          let i = X[e];
          X[e] = Math.max(0, X[e] - I);
          if (r === D)Q[e] = 1;
          let f = ae(e);
          let a = t - f;
          if (r === de && Z[e] === 0 && i > 0 && X[e] <= 0) {
            b = Math.round(L * .5)
          }
          if (e === le && !s) {
            q[r] -= 2;
            if (!A)T.push(`   -> [SLOW] Attacker speed permanently reduced. New speed: ${q[r]}`)
          }
          if (r === j)te[r] = 0;
          if (e === j)te[e]++;
          let n = F(e);
          if (X[e] <= 0) {
            if (e === G && !ie) {
              ie = true;
              X[e] = fe;
              if (!A) {
                T.push(`   -> [WIPEOUT] Zombie group was completely destroyed!`);
                x = `   -> [REVIVE] Passive triggered! ${fe} Zombies resurrect with 1 HP each instantly.`
              }
            }
            else {
              X[e] = 0;
              if (ee[e] === 0) {
                ee[e] = 1;
                R++;
                if (K[e])N--;
                else O--
              }
              if (!A)T.push(`   -> Result: ${n} died completely.`)
            }
          }
          else {
            if (!A)T.push(`   -> Result: ${n} took damage. ${a} units died. HP Left: ${X[e]}`)
          }
          if (e === se && i > 0 && X[e] <= 0) {
            let e = S[4];
            let t = Math.ceil(e * J[se] * .2);
            X[r] = Math.max(0, X[r] - t);
            if (!A)T.push(`   -> [EXPLOSION] Reflected ${t} DMG to ${h}. Attacker HP Left: ${X[r]}`);
            if (X[r] <= 0 && ee[r] === 0) {
              X[r] = 0;
              ee[r] = 1;
              R++;
              if (K[r])N--;
              else O--
            }
          }
          I -= i;
          if (r === H && I > 0 && w < 1) {
            w++;
            if (!A && l + 1 < o.length && X[o[l + 1]] > 0) {
              T.push(`   -> [OVERKILL] ${h} transfers ${I} remaining damage to next target...`)
            }
            continue
          }
          else {
            break
          }
        }
        if (x && !A) {
          T.push(x)
        }
        if (b > 0) {
          let t =[];
          for (let e = 0;e < 8;e++) {
            if (X[e] > 0 && Z[e] === 1)t.push(e)
          }
          if (t.length > 0) {
            t.sort((e, t) => {
              if (q[e] !== q[t])return q[e] - q[t];
              let i = ae(e);
              let f = ae(t);
              if (i !== f)return f - i;
              return Y[e] - Y[t]
            });
            let e = t[0];
            X[e] = Math.max(0, X[e] - b);
            if (!A) {
              T.push(`   <span style="display:inline-flex; align-items:center; gap:4px;">-> [SPLASH] ${h} ability triggers! Deals ${b} damage to rearguard: ${E(e)} ${F(e)}. HP Left: ${X[e]}</span>`)
            }
            if (X[e] <= 0 && ee[e] === 0) {
              X[e] = 0;
              ee[e] = 1;
              R++;
              N--;
              if (!A)T.push(`   -> Result: ${F(e)} died completely from splash.`)
            }
          }
        }
        if (v > 0) {
          for (let e = 8;e < 19;e++) {
            if (X[e] > 0 && Z[e] === 1) {
              X[e] = Math.max(0, X[e] - v);
              if (!A) {
                T.push(`   <span style="display:inline-flex; align-items:center; gap:4px;">-> [SPLASH] ${h} ability triggers! Deals ${v} damage to rearguard: ${E(e)} ${F(e)}. HP Left: ${X[e]}</span>`)
              }
              if (X[e] <= 0 && ee[e] === 0) {
                X[e] = 0;
                ee[e] = 1;
                R++;
                O--;
                if (!A)T.push(`   -> Result: ${F(e)} died completely from splash.`)
              }
            }
          }
        }
      }
      if (X[M] > 0) {
        p[z] += 10;
        X[z] += 10 * J[z];
        if (ee[z] === 1) {
          ee[z] = 0;
          O++
        }
        if (!A)T.push(`[SPAWN] Broodmother spawned 10 Spiderlings (Total: ${p[z]}).`)
      }
      for (let e = 0;e < 19;e++)Q[e] = 0;
      if (A && e > 0) {
        if (X[g] > 0) {
          B += e
        }
      }
      k++
    }
    let n = O === 0;
    if (A && !n)return {
      u: Infinity, m: Infinity, h: k - 1
    };
    let l = 0, r = 0;
    let s =[], o =[];
    let d = 0;
    for (let i = 0;i < 8;i++) {
      if (f[i] > 0) {
        let t = f[i] - ae(i);
        if (t > 0) {
          l += t * L[i];
          r += t
        }
        if (!A) {
          let e = E(i);
          s.push(`<span style="white-space:nowrap;">${e} x ${f[i]}</span>`);
          d += f[i] * y[i];
          if (t > 0)o.push(`<span style="white-space:nowrap;">${e} x ${t}</span>`)
        }
      }
    }
    if (A)return {
      u: l, m: r, h: k - 1
    };
    let u = n?`<span style="color:#50fa7b; font-weight:bold;">VICTORY</span>`: `<span style="color:#ff5555; font-weight:bold;">DEFEATED</span>`;
    return {
      u: l, p: r, details: o.length > 0?o.join(", "): "None", g: s.join(", "), M: d, h: k - 1, log: T.join("\n"), $: u
    }
  }
  function x(e = null, t = null) {
    let i = new Int32Array(8);
    let f = new Int32Array(10);
    let a = false, n = false;
    I.forEach((e, t) => {
      i[t] = parseInt(document.getElementById(e.id).value) || 0;
      if (i[t] > 0)a = true
    });
    v.forEach((e, t) => {
      f[t] = parseInt(document.getElementById(e.id).value) || 0;
      if (f[t] > 0)n = true
    });
    if (!a || !n)return alert("Add units first!");
    let l = w(i, f, false, 0);
    let r = typeof e === "string"?`=== BATTLE REPORT ===`: `=== MANUAL BATTLE SIMULATION ===`;
    let s = 10 +(parseInt(document.getElementById("layerInput").value) || 1) * 10;
    let o = t || `[Army Strength Used: ${l.M}/${s} | Fallen units: ~${l.p} | Cost: ~${l.u} | Rounds: ${l.h}]`;
    let d = '<div style="color:#f1fa8c; font-size:16px; font-weight:bold; margin-bottom:4px;">' + r + "</div>" + '<div style="color:#a9b7c6; font-weight:bold; margin-bottom:15px;">' + o + "</div>" + '<div style="background:rgba(20,20,20,0.8); padding:10px; border:1px solid #443; border-radius:4px;">' + '<div style="font-size:16px; margin-bottom:8px;">Result: ' + l.$ + "</div>" + '<div style="margin-bottom:6px;"><strong style="color:#a6e3a1; margin-right:5px;">YOUR UNITS:</strong> <span style="line-height: 1.6;">' + l.g + "</span></div>" + '<div><strong style="color:#ff4d4d; margin-right:5px;">FALLEN UNITS:</strong> <span style="line-height: 1.6;">' + l.details + "</span></div>" + "</div>";
    document.getElementById("logOutput").innerHTML = d + l.log;
    document.getElementById("logOutput").scrollIntoView({
      behavior: "smooth"
    })
  }
  function S(e, t, o, d) {
    let i = document.getElementById("results-list");
    let f = t === "best"?"BEST FORMATIONS (MINIMUM COST)": "SAFEST FORMATIONS (STRESS TESTED)";
    let u = `<div id="results-header">${f}:</div>`;
    if (e.length === 0) {
      u += `<div style="padding:10px;">No viable formations found yet...</div>`
    }
    else {
      let r = h === "vampire"?"1": "2";
      let s = h === "vampire"?c: m;
      e.forEach((e, t) => {
        let i =[...e.L].sort((t, i) => {
          let e = d.find(e => e.id === t.id);
          let f = d.find(e => e.id === i.id);
          return e.i - f.i
        });
        let f = i.map(i => {
          if (i.count > 0) {
            let e = d.find(e => e.id === i.id);
            let t = `./img/Tier${e.i}_Frame-B-1_${r}.jpg`;
            return`<span style="display:inline-flex; align-items:center; gap:2px;"><img src="${t}" class="img-log dyn-img" data-tier="${e.i}" title="${s[e.i-1]}"> x ${i.count}</span>`
          }
          return null
        }).filter(e => e).join(", ");
        let a = `[Army Strength Used: ${e.v}/${o} | Fallen units: ~${e.m} | Cost: ~${e.u} | Rounds: ${e.h}]`;
        let n = `<b>${t+1}. Deploy:</b> ${f} <span style="color:#f1fa8c; font-weight:bold; margin-left: 10px;">- Est. Fallen Units: ~${e.m} units (Cost: ~${e.u})</span>`;
        let l = encodeURIComponent(JSON.stringify(e.L));
        u += `<div class="result-item" data-formation="${l}" data-extrainfo="${a}">
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:2px; width:100%;">${n} <i class="fa-solid fa-chevron-right" style="margin-left:auto;"></i></div>
                </div>`
      })
    }
    i.innerHTML = u
  }
  function A(e, t) {
    let i = JSON.parse(decodeURIComponent(e));
    I.forEach(e => document.getElementById(e.id).value = 0);
    i.forEach(e => {
      let t = document.getElementById(e.id);
      if (t)t.value = e.count
    });
    o();
    x(`Selected Formation`, t)
  }
  function T(i, f, a, e) {
    let n = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0
    };
    for (let t = 0;t < f.length;t++) {
      let e = i[t] * f[t].weight / a * 100;
      n[f[t].i] += e
    }
    if (e >= 11 && e <= 20) {
      if (n[1] >= 90)return false;
      if (n[2] >= 90)return false;
      if (n[3] >= 90)return false;
      if (n[4] >= 90)return false;
      if (n[5] >= 50)return false;
      if (n[6] >= 90)return false;
      if (n[7] >= 90)return false
    }
    else if (e >= 21 && e <= 30) {
      if (n[1] >= 85)return false;
      if (n[2] >= 85)return false;
      if (n[3] >= 75)return false;
      if (n[4] >= 75)return false;
      if (n[5] >= 75)return false;
      if (n[6] >= 75)return false;
      if (n[7] >= 75)return false
    }
    else if (e >= 31 && e <= 40) {
      if (n[1] > 80)return false;
      if (n[2] > 80)return false;
      if (n[3] > 70)return false;
      if (n[4] > 55)return false;
      if (n[5] > 55)return false;
      if (n[6] > 55)return false;
      if (n[7] > 55)return false;
      if (n[8] > 65)return false
    }
    else if (e >= 41 && e <= 50) {
      if (n[1] > 65)return false;
      if (n[2] > 65)return false;
      if (n[3] > 60)return false;
      if (n[4] > 50)return false;
      if (n[5] > 50)return false;
      if (n[6] > 50)return false;
      if (n[7] > 50)return false;
      if (n[8] > 60)return false
    }
    else if (e >= 51 && e <= 60) {
      if (n[1] > 70)return false;
      if (n[2] > 70)return false;
      if (n[3] > 70)return false;
      if (n[4] > 75)return false;
      if (n[5] > 50)return false;
      if (n[6] > 50)return false;
      if (n[7] > 50)return false;
      if (n[8] > 60)return false
    }
    else if (e >= 61 && e <= 70) {
      if (n[1] > 55)return false;
      if (n[2] > 60)return false;
      if (n[3] > 60)return false;
      if (n[4] > 50)return false;
      if (n[5] > 50)return false;
      if (n[6] > 50)return false;
      if (n[7] > 50)return false;
      if (n[8] > 60)return false
    }
    else if (e >= 71) {
      if (n[1] > 50)return false;
      if (n[2] > 55)return false;
      if (n[3] > 55)return false;
      if (n[4] > 45)return false;
      if (n[5] > 45)return false;
      if (n[6] > 50)return false;
      if (n[7] > 50)return false;
      if (n[8] > 60)return false
    }
    return true
  }
  async function k(d) {
    let e = document.getElementById("btn-opt-best");
    let t = document.getElementById("btn-opt-safe");
    let i = document.getElementById("opt-text-best");
    let f = document.getElementById("opt-text-safe");
    if (l) {
      b = true;
      i.innerText = "CANCELLING...";
      f.innerText = "CANCELLING...";
      return
    }
    let u = parseInt(document.getElementById("layerInput").value) || 1;
    let c = 10 + u * 10;
    let m = new Int32Array(10);
    let a = false;
    v.forEach((e, t) => {
      m[t] = parseInt(document.getElementById(e.id).value) || 0;
      if (m[t] > 0)a = true
    });
    if (!a)return alert("Add enemies!");
    let n = I.filter(e => document.getElementById("chk_" + e.id).checked);
    if (!n.length)return alert("Select at least one unit!");
    l = true;
    b = false;
    document.getElementById("results-container").style.display = "block";
    document.getElementById("async-loader").style.display = "flex";
    document.getElementById("results-list").innerHTML = `<div style="padding:10px;">Initializing Hyper-Fast DOD search space...</div>`;
    if (d === "best") {
      e.classList.add("btn-cancel");
      i.innerText = "STOP SEARCH"
    }
    else {
      t.classList.add("btn-cancel");
      f.innerText = "STOP SEARCH"
    }
    let h =[];
    let p = 0;
    let g = Date.now();
    let M =[...n].sort((e, t) => t.weight - e.weight);
    function $(e, a) {
      h.push(e);
      if (a === "best") {
        h.sort((e, t) => e.u - t.u || e.h - t.h || t.v - e.v)
      }
      else {
        h.sort((e, t) => e.I - t.I || e.m - t.m || e.h - t.h || e.u - t.u || t.v - e.v)
      }
      let t =[];
      for (let f of h) {
        let e = t.some(t => {
          let i = 0;
          for (let e = 0;e < f.L.length;e++) {
            i += Math.abs(f.L[e].count - t.L[e].count)
          }
          let e = u < 10?1: a === "safest"?Math.max(4, Math.floor(c / 10)): Math.max(2, Math.floor(c / 20));
          return i < e
        });
        if (!e)t.push(f);
        if (t.length >= 10)break
      }
      h = t
    }
    let y = new Array(M.length).fill(0);
    async function L(l, r) {
      if (b)return;
      if (l === M.length - 1) {
        let n = M[l].weight;
        let e = Math.max(0, Math.ceil((c * .95 - r) / n));
        let t = Math.floor((c - r) / n);
        let i = document.getElementById(`max_a${M[l].i}`);
        if (i && i.value !== "") {
          let e = parseInt(i.value);
          if (!isNaN(e) && e >= 0) {
            t = Math.min(t, e)
          }
        }
        else {
          if (M[l].i === 4)t = Math.min(t, 15);
          if (M[l].i === 5)t = Math.min(t, 15);
          if (M[l].i === 6)t = Math.min(t, 10)
        }
        for (let a = e;a <= t;a++) {
          y[l] = a;
          if (!T(y, M, c, u))continue;
          let i = new Int32Array(8);
          let t = false;
          for (let e = 0;e < y.length;e++) {
            if (y[e] > 0) {
              i[M[e].i - 1] = y[e];
              t = true
            }
          }
          if (!t)continue;
          let f = w(i, m, true, 0);
          if (f.u !== Infinity) {
            let t = y.map((e, t) =>({
              id: M[t].id, count: e
            }));
            if (d === "safest") {
              let e = w(i, m, true, .1);
              if (e.u !== Infinity) {
                $({
                  L: t, u: f.u, m: f.m, h: f.h, v: r + a * n, I: e.m
                }, d)
              }
            }
            else {
              let e = w(i, m, true, .1);
              if (e.u !== Infinity && e.u <= f.u * 1.1) {
                $({
                  L: t, u: f.u, m: f.m, h: f.h, v: r + a * n, I: f.m
                }, d)
              }
            }
          }
        }
        p++;
        if (p % 500 === 0) {
          let e = Date.now();
          if (e - g > 40) {
            S(h, d, c, M);
            g = e;
            await new Promise(e => setTimeout(e, 0))
          }
        }
        return
      }
      let e = M[l];
      let t = e.weight;
      let i = Math.floor((c - r) / t);
      let f = document.getElementById(`max_a${e.i}`);
      if (f && f.value !== "") {
        let e = parseInt(f.value);
        if (!isNaN(e) && e >= 0) {
          i = Math.min(i, e)
        }
      }
      else {
        if (u <= 10) {
          if (e.i === 1)defLimit = Math.max(1, c / 2);
          if (e.i === 2)defLimit = Math.max(1, c / 3);
          if (e.i === 3)defLimit = Math.max(1, c / 4);
          if (e.i === 4)defLimit = Math.max(1, c / 7);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12);
          if (e.i === 7)defLimit = Math.max(1, c / 18);
          if (e.i === 8)defLimit = Math.max(1, c / 30)
        }
        else if (u >= 11 && u <= 20) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .85);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .85);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .75);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .75);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .75);
          if (e.i === 7)defLimit = Math.max(1, c / 18 * .75);
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .75)
        }
        else if (u >= 21 && u <= 30) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .8);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .8);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .7);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .55);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .55);
          if (e.i === 7)defLimit = Math.max(1, c / 18 * .55);
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .55)
        }
        else if (u >= 31 && u <= 40) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .75);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .75);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .66);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .5);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .5);
          if (e.i === 7)defLimit = Math.max(1, c / 18 * .5);
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .65)
        }
        else if (u >= 41 && u <= 50) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .65);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .65);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .6);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .5);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .5);
          if (e.i === 7)defLimit = Math.max(1, c / 18 * .5);
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .6)
        }
        else if (u >= 51 && u <= 60) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .6);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .7);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .7);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .55);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .5);
          if (e.i === 7)defLimit = Math.max(1, c / 18 * .5);
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .6)
        }
        else if (u >= 61 && u <= 70) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .55);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .65);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .6);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .5);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .5);
          if (e.i === 7)defLimit = 1;
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .6)
        }
        else if (u >= 71) {
          if (e.i === 1)defLimit = Math.max(1, c / 2 * .45);
          if (e.i === 2)defLimit = Math.max(1, c / 3 * .55);
          if (e.i === 3)defLimit = Math.max(1, c / 4 * .55);
          if (e.i === 4)defLimit = Math.max(1, c / 7 * .45);
          if (e.i === 5)defLimit = 1;
          if (e.i === 6)defLimit = Math.max(1, c / 12 * .5);
          if (e.i === 7)defLimit = 1;
          if (e.i === 8)defLimit = Math.max(1, c / 30 * .6)
        }
        i = Math.min(i, defLimit)
      }
      let a = 1;
      if (u <= 10) {
        if (e.i == 5)a = 10
      }
      else if (u >= 11 && u <= 20) {
        if (M.length > 4) {
          if (e.i == 1)a = 2;
          if (e.i == 2)a = 1;
          if (e.i == 3)a = 1;
          if (e.i == 4)a = 1;
          if (e.i == 5)a = 2;
          if (e.i == 6)a = 1;
          if (e.i == 7)a = 1;
          if (e.i == 8)a = 1
        }
      }
      else if (u >= 21 && u <= 30) {
        if (M.length > 4) {
          if (e.i == 1)a = 4;
          if (e.i == 2)a = 2;
          if (e.i == 3)a = 10;
          if (e.i == 4)a = 1;
          if (e.i == 5)a = 2;
          if (e.i == 6)a = 1;
          if (e.i == 7)a = 2;
          if (e.i == 8)a = 1
        }
      }
      else if (u >= 31 && u <= 40) {
        if (M.length > 4 && M.length <= 6) {
          if (e.i == 1)a = 6;
          if (e.i == 2)a = 6;
          if (e.i == 3)a = 10;
          if (e.i == 4)a = 1;
          if (e.i == 5)a = 2;
          if (e.i == 6)a = 1
        }
        else if (M.length > 6) {
          if (e.i == 1)a = 10;
          if (e.i == 2)a = 10;
          if (e.i == 3)a = 10;
          if (e.i == 4)a = 1;
          if (e.i == 5)a = 2;
          if (e.i == 6)a = 1;
          if (e.i == 7)a = 3;
          if (e.i == 8)a = 1
        }
      }
      else if (u >= 41 && u <= 50) {
        if (M.length > 4 && M.length <= 6) {
          if (e.i == 1)a = Math.floor(u / 6);
          if (e.i == 2)a = 2;
          if (e.i == 3)a = 2;
          if (e.i == 4)a = Math.floor(u / 10);
          if (e.i == 5)a = 3;
          if (e.i == 6)a = 1
        }
        else if (M.length > 6) {
          if (e.i == 1)a = Math.floor(u / 4);
          if (e.i == 2)a = Math.floor(u / 4);
          if (e.i == 3)a = Math.floor(u / 12);
          if (e.i == 4)a = Math.floor(u / 6);
          if (e.i == 5)a = 3;
          if (e.i == 6)a = Math.floor(u / 6);
          if (e.i == 7)a = 3;
          if (e.i == 8)a = 2
        }
      }
      else if (u >= 51 && u <= 60) {
        if (M.length <= 4) {
          if (e.i == 1)a = 3;
          if (e.i == 2)a = 1;
          if (e.i == 3)a = 6;
          if (e.i == 4)a = 1
        }
        else if (M.length > 4 && M.length <= 6) {
          if (e.i == 1)a = Math.floor(u / 6);
          if (e.i == 2)a = 2;
          if (e.i == 3)a = Math.floor(u / 10);
          if (e.i == 4)a = 2;
          if (e.i == 5)a = 3;
          if (e.i == 6)a = 2
        }
        else if (M.length > 6) {
          if (e.i == 1)a = Math.floor(u / 5);
          if (e.i == 2)a = Math.floor(u / 12);
          if (e.i == 3)a = Math.floor(u / 5);
          if (e.i == 4)a = Math.floor(u / 12);
          if (e.i == 5)a = 3;
          if (e.i == 6)a = Math.floor(u / 12);
          if (e.i == 7)a = 4;
          if (e.i == 8)a = 1
        }
      }
      else if (u >= 61 && u <= 70) {
        if (M.length > 4 && M.length <= 6) {
          if (e.i == 1)a = Math.floor(u / 6);
          if (e.i == 2)a = Math.floor(u / 6);
          if (e.i == 3)a = Math.floor(u / 10);
          if (e.i == 4)a = 2;
          if (e.i == 5)a = 3;
          if (e.i == 6)a = 6
        }
        else if (M.length > 6) {
          if (e.i == 1)a = Math.floor(u / 4);
          if (e.i == 2)a = Math.floor(u / 4);
          if (e.i == 3)a = Math.floor(u / 4);
          if (e.i == 4)a = 6;
          if (e.i == 5)a = 4;
          if (e.i == 6)a = 6;
          if (e.i == 7)a = 4;
          if (e.i == 8)a = 4
        }
      }
      else if (u >= 71 && u <= 90) {
        if (M.length <= 7) {
          if (e.i == 1)a = Math.floor(u / 3);
          if (e.i == 2)a = Math.floor(u / 3);
          if (e.i == 3)a = Math.floor(u / 6);
          if (e.i == 4)a = Math.floor(u / 10);
          if (e.i == 5)a = 4;
          if (e.i == 6)a = 3;
          if (e.i == 7)a = 3
        }
        else if (M.length > 7) {
          if (e.i == 1)a = Math.floor(u / 3);
          if (e.i == 2)a = Math.floor(u / 3);
          if (e.i == 3)a = Math.floor(u / 3);
          if (e.i == 4)a = Math.floor(u / 6);
          if (e.i == 5)a = 4;
          if (e.i == 6)a = Math.floor(u / 6);
          if (e.i == 7)a = 4;
          if (e.i == 8)a = 4
        }
      }
      else if (u >= 91) {
        if (M.length <= 7) {
          if (e.i == 1)a = Math.floor(u / 5);
          if (e.i == 2)a = Math.floor(u / 5);
          if (e.i == 3)a = Math.floor(u / 5);
          if (e.i == 4)a = 3;
          if (e.i == 5)a = 20;
          if (e.i == 6)a = 3;
          if (e.i == 7)a = 4
        }
        else if (M.length > 7) {
          if (e.i == 1)a = Math.floor(u / 6);
          if (e.i == 2)a = Math.floor(u / 6);
          if (e.i == 3)a = Math.floor(u / 6);
          if (e.i == 4)a = Math.floor(u / 20);
          if (e.i == 5)a = 4;
          if (e.i == 6)a = Math.floor(u / 12);
          if (e.i == 7)a = 4;
          if (e.i == 8)a = 4
        }
      }
      let n = Math.max(1, a);
      let s =[];
      if (i >= 0)s.push(0);
      if (i >= 1)s.push(1);
      let o = n === 1?2: n;
      for (let e = o;e <= i;e += n) {
        if (!s.includes(e)) {
          s.push(e)
        }
      }
      for (let e of s) {
        y[l] = e;
        await L(l + 1, r + e * t)
      }
    }
    await L(0, 0);
    l = false;
    document.getElementById("async-loader").style.display = "none";
    e.classList.remove("btn-cancel");
    i.innerText = "Find Optimal Formation";
    t.classList.remove("btn-cancel");
    f.innerText = "Find Safest Formation";
    S(h, d, c, M)
  }
  function R() {
    let e = document.getElementById("logOutput");
    if (!e || e.innerText.includes("Battle Log will appear here...")) {
      alert("There is no report to copy yet!");
      return
    }
    let t = e.cloneNode(true);
    let i = t.querySelectorAll("img");
    i.forEach(e => {
      let t = e.getAttribute("title") || "";
      let i = document.createTextNode(t);
      e.parentNode.replaceChild(i, e)
    });
    t.style.position = "absolute";
    t.style.left = "-9999px";
    t.style.display = "block";
    document.body.appendChild(t);
    let f = t.innerText;
    document.body.removeChild(t);
    navigator.clipboard.writeText(f).then(() => {
      let e = document.getElementById("btn-copy-log");
      let t = e.innerHTML;
      e.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      e.style.background = "#2b4f2d";
      e.style.borderColor = "#50fa7b";
      e.style.color = "#fff";
      setTimeout(() => {
        e.innerHTML = t;
        e.style.background = "";
        e.style.borderColor = "";
        e.style.color = ""
      }, 2e3)
    })["catch"](e => {
      console.error("Failed to copy: ", e);
      alert("Failed to copy to clipboard.")
    })
  }
  document.querySelectorAll(".layer-mod-btn").forEach(e => {
    e.addEventListener("click", e => {
      s(parseInt(e.currentTarget.getAttribute("data-amt")))
    })
  });
  document.getElementById("layerInput").addEventListener("change", f);
  document.querySelectorAll(".unit-mod-btn").forEach(e => {
    e.addEventListener("click", e => {
      let t = e.currentTarget.getAttribute("data-target");
      let i = parseInt(e.currentTarget.getAttribute("data-amt"));
      u(t, i)
    })
  });
  document.querySelectorAll(".unit-count-input").forEach(e => {
    e.addEventListener("change", e => {
      d(e.currentTarget.id)
    })
  });
  document.querySelectorAll(".race-select-btn").forEach(e => {
    e.addEventListener("click", e => {
      t(e.currentTarget.getAttribute("data-race"))
    })
  });
  document.querySelectorAll(".btn-filter-enemies, .btn-filter-allies").forEach(e => {
    e.addEventListener("click", e => {
      a(e.currentTarget.getAttribute("data-side"), e.currentTarget.getAttribute("data-pos"))
    })
  });
  document.getElementById("btn-sim").addEventListener("click", () => x());
  document.getElementById("btn-opt-best").addEventListener("click", () => k("best"));
  document.getElementById("btn-opt-safe").addEventListener("click", () => k("safest"));
  document.getElementById("btn-copy-log").addEventListener("click", R);
  document.getElementById("results-list").addEventListener("click", e => {
    let i = e.target.closest(".result-item");
    if (i) {
      let e = i.getAttribute("data-formation");
      let t = i.getAttribute("data-extrainfo");
      A(e, t)
    }
  });
  n();
  f();
  t(h)
});
