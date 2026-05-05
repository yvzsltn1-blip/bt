"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

const files = [
  "app.js",
  "battle-core.js",
  "battle-core-v2.js",
  "bulk-regression.js",
  "optimizer.js",
  "optimizer-v2.js",
  "reliability.js",
  "saved.js",
  "wrong.js"
];

const expectedByFile = {
  "app.js": [
    "Yarasa Surusu (T1)",
    "Gulyabani (T2)",
    "Vampir Kole (T3)",
    "Banshee (T4)",
    "Olu Cagirici (T5)",
    "Gargoyle (T6)",
    "Kan Cadisi (T7)",
    "Curuk Girtlak (T8)"
  ],
  "battle-core.js": [
    "Yarasa Surusu (T1)",
    "Gulyabani (T2)",
    "Vampir Kole (T3)",
    "Banshee (T4)",
    "Olu Cagirici (T5)",
    "Gargoyle (T6)",
    "Kan Cadisi (T7)",
    "Curuk Girtlak (T8)",
    "Iskelet (R1)",
    "Zombi (R2)",
    "Namevt Kultist (R3)",
    "Kemik Kanat (R4)",
    "Sismis Kadavra (R5)",
    "Mezar Dehseti (R6)",
    "Hortlaksi (R7)",
    "Kemik Izbandut (R8)",
    "Kulucka Anasi (R9)",
    "Ceset (R10)"
  ],
  "battle-core-v2.js": [
    "Yarasa Surusu (T1)",
    "Gulyabani (T2)",
    "Vampir Kole (T3)",
    "Banshee (T4)",
    "Olu Cagirici (T5)",
    "Gargoyle (T6)",
    "Kan Cadisi (T7)",
    "Curuk Girtlak (T8)",
    "Iskelet (R1)",
    "Zombi (R2)",
    "Namevt Kultist (R3)",
    "Kemik Kanat (R4)",
    "Sismis Kadavra (R5)",
    "Mezar Dehseti (R6)",
    "Hortlaksi (R7)",
    "Kemik Izbandut (R8)",
    "Kulucka Anasi (R9)",
    "Ceset (R10)"
  ],
  "bulk-regression.js": [
    "Yarasa Surusu (T1)",
    "Gulyabani (T2)",
    "Vampir Kole (T3)",
    "Banshee (T4)",
    "Olu Cagirici (T5)",
    "Gargoyle (T6)",
    "Kan Cadisi (T7)",
    "Curuk Girtlak (T8)"
  ],
  "optimizer.js": [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ],
  "optimizer-v2.js": [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ],
  "reliability.js": [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ],
  "saved.js": [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ],
  "wrong.js": [
    "Yarasa Surusu",
    "Gulyabani",
    "Vampir Kole",
    "Banshee",
    "Olu Cagirici",
    "Gargoyle",
    "Kan Cadisi",
    "Curuk Girtlak"
  ]
};

const forbiddenEverywhere = [
  "Yarasalar",
  "Gulyabaniler",
  "Vampir Koleler",
  "Bansiler",
  "Nekromantlar",
  "Gargoyller",
  "Kan Cadilari",
  "Curuk Ceneler",
  "Iskelet (T1)",
  "Zombi (T2)",
  "Tarikatci (T3)",
  "Kemik Kanat (T4)",
  "Sismis Ceset (T5)",
  "Hayalet (T6)",
  "Hortlak (T7)",
  "Kemik Dev (T8)",
  "Yavrulayan Ana (T9)",
  "Lich (T10)",
  "Olumsuz Tarikatcilar",
  "Sismis Cesetler",
  "Hayaletler",
  "Hortlaklar",
  "Kemik Devler",
  "Yavrulayan Analar",
  "Lichler"
];

for (const file of files) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const expected of expectedByFile[file]) {
    assert(
      content.includes(expected),
      `${file} expected to include: ${expected}`
    );
  }
  for (const forbidden of forbiddenEverywhere) {
    assert(
      !content.includes(forbidden),
      `${file} still includes old name: ${forbidden}`
    );
  }
}

console.log("Unit name regression checks passed.");
