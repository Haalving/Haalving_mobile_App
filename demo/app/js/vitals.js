/* HAALVING — the Vital Panel.

   Structure borrowed from Fittr's "Vital Health Overview" (My Health → Summary),
   studied on device: a report-level gauge, a grid of body-system categories each
   flagging how many of its markers fall outside reference, and a per-category
   sheet listing every marker against its reference band.

   The load-bearing detail is that categories are VIEWS, not partitions — Average
   Blood Glucose belongs to both Blood and Sugar, Apolipoprotein A1 to both Heart
   and Lipid Profile, Urine Glucose to both Sugar and Urine. So markers are
   defined once here and referenced by key from as many categories as claim them.

   Reference bands are clinical constants, not client data, which is why they live
   in this catalogue rather than in the seed. Sex-specific bands are declared with
   `f:` and apply when the client record says sex 'F'. */
(function () {
  'use strict';

  /* ── the markers ────────────────────────────────────────────────────────
     name  as a lab prints it        unit  as a lab prints it
     low/high  adult reference band  f:    the band when sex is 'F'
     ok:[…]    a qualitative marker's acceptable readings
     what      one plain sentence: what this measures and why it is on the panel */
  var M = {
    /* — gut microbiome —
       `cohort: true` marks a band that is NOT a clinical reference limit. A
       sequencing lab reports you against the spread of a healthy cohort, so
       "outside" here means unusual among well people, not abnormal. The panel
       says so in as many words wherever one of these is drawn — see the two
       read sites in client-profile.js. */
    mb_shannon: { name: 'Shannon diversity index', unit: '', low: 3, high: 4.5, cohort: true,
      what: 'How many different bacterial species live in your gut and how evenly they share it. A narrow gut is the single most repeated finding in the microbiome literature — variety is what makes the community resilient.' },
    mb_fb: { name: 'Firmicutes / Bacteroidetes ratio', unit: '', low: 0.5, high: 3, cohort: true,
      what: 'The balance between the two dominant bacterial phyla. It shifts with how much fibre versus fat you eat, which is why it moves with a diet change rather than with a pill.' },
    mb_akk: { name: 'Akkermansia muciniphila', unit: '%', low: 0.5, high: 4, cohort: true,
      what: 'A single species that lives in your gut lining and feeds on its mucus, keeping that layer thick. Well-fed populations track with better metabolic readings.' },
    mb_bifido: { name: 'Bifidobacterium', unit: '%', low: 1, high: 10, cohort: true,
      what: 'One of the first genera to colonise a human gut and among the most reliably beneficial. It ferments fibre you cannot digest yourself.' },
    mb_butyrate: { name: 'Butyrate producers', unit: '%', low: 5, high: 20, cohort: true,
      what: 'The share of your community that makes butyrate — the short-chain fatty acid your colon cells burn as their own fuel. Fibre is what they make it from.' },
    mb_entero: { name: 'Enterobacteriaceae', unit: '%', low: 0, high: 2, cohort: true,
      what: 'A family that belongs in a gut in small numbers. A raised share is one of the clearer signals that the community is out of balance rather than simply different.' },
    mb_calpro: { name: 'Faecal calprotectin', unit: 'µg/g', low: 0, high: 50,
      what: 'A protein white blood cells release into the bowel when it is inflamed. Unlike the rest of this group this one is a clinical measure, and it is the reason a raised result is worth a conversation.' },

    /* — Epilimo Test —
       ILLUSTRATIVE, NOT TRANSCRIBED. Unlike every other marker in this file,
       these five were not taken from a real assay's reference sheet: the panel
       is a placeholder standing in for the Epilimo report until we have one to
       transcribe. Nothing downstream treats them differently — so if you are
       here to wire the real test, REPLACE these rather than adding beside them,
       and drop the cohort flags if the lab publishes true reference limits. */
    epi_pace: { name: 'Pace of ageing', unit: 'yrs/yr', low: 0.85, high: 1.05, cohort: true,
      what: 'How many years of biological change your body accumulated over the last calendar year. Below one means you are ageing more slowly than the clock.' },
    epi_gap: { name: 'Age gap (biological − lived)', unit: 'yrs', low: -5, high: 2, cohort: true,
      what: 'The distance between the age your cells read and the age on your passport. A negative number is the direction the whole programme is aiming for.' },
    epi_telomere: { name: 'Telomere length', unit: 'kb', low: 6.5, high: 8.5, cohort: true,
      what: 'The protective caps on the ends of your chromosomes, which shorten a little each time a cell divides. Length is read against others of your age, never on its own.' },
    epi_methyl: { name: 'Global methylation index', unit: '%', low: 72, high: 82, cohort: true,
      what: 'How much of your DNA carries the chemical tags that switch genes on and off. The pattern, not the sequence, is what an epigenetic clock actually reads.' },
    epi_immune: { name: 'Immune resilience score', unit: '', low: 60, high: 100, cohort: true,
      what: 'A composite of the immune-cell signatures that decline with age. It is the part of biological age that responds fastest to sleep and to training load.' },

    /* — sugar — */
    hba1c: { name: 'Glycosylated haemoglobin (HbA1c)', unit: '%', low: 4, high: 5.6,
      what: 'The share of your haemoglobin that sugar has stuck to. Because red cells live about three months, it reads as an average of your blood sugar over that window rather than a single morning.' },
    fbs: { name: 'Fasting blood sugar', unit: 'mg/dL', low: 70, high: 100,
      what: 'Blood sugar after roughly eight hours without food — the baseline your body settles to when nothing is being digested.' },
    abg: { name: 'Average blood glucose (ABG)', unit: 'mg/dL', low: 70, high: 125,
      what: 'Your HbA1c restated as an everyday glucose number, so the three-month average can be compared with the readings a glucometer shows.' },

    /* — blood count — */
    hb: { name: 'Haemoglobin (Hb)', unit: 'g/dL', low: 13, high: 17, f: { low: 12, high: 15 },
      what: 'The oxygen-carrying protein in your red cells. Low values are the usual explanation for breathlessness and afternoon fatigue.' },
    hct: { name: 'Haematocrit (PCV)', unit: '%', low: 40, high: 50, f: { low: 36, high: 46 },
      what: 'What proportion of your blood is red cells rather than plasma. It moves with haemoglobin and with how hydrated you are.' },
    rbc: { name: 'Red blood cell count', unit: 'mil/µL', low: 4.5, high: 5.5, f: { low: 3.8, high: 4.8 },
      what: 'How many red cells are in a set volume of blood — the count behind the haemoglobin figure.' },
    mcv: { name: 'Mean corpuscular volume (MCV)', unit: 'fL', low: 83, high: 101,
      what: 'The average size of one red cell. Small cells point towards iron; large ones towards B12 or folate.' },
    mch: { name: 'Mean corpuscular haemoglobin (MCH)', unit: 'pg', low: 27, high: 32,
      what: 'How much haemoglobin sits inside an average red cell.' },
    mchc: { name: 'Mean corpuscular haemoglobin concentration (MCHC)', unit: 'g/dL', low: 31.5, high: 34.5,
      what: 'How tightly packed that haemoglobin is inside the cell, rather than how much of it there is.' },
    rdw: { name: 'Red cell distribution width (RDW-CV)', unit: '%', low: 11.5, high: 14,
      what: 'How much your red cells vary in size. A widening spread is often the first sign of a developing deficiency, before haemoglobin itself falls.' },
    wbc: { name: 'Total leucocyte count (WBC)', unit: '10³/µL', low: 4, high: 10,
      what: 'Total white cells — the body’s defence force. It rises with infection and with some inflammatory states.' },
    neut_abs: { name: 'Neutrophils absolute count', unit: '10³/µL', low: 2, high: 7,
      what: 'The white cells that answer bacterial infection first, counted directly.' },
    neut_diff: { name: 'Neutrophils differential count', unit: '%', low: 40, high: 80,
      what: 'The same neutrophils expressed as a share of all white cells.' },
    lymph_abs: { name: 'Lymphocytes absolute count', unit: '10³/µL', low: 1, high: 3,
      what: 'The white cells that carry immune memory and lead the response to viruses.' },
    lymph_diff: { name: 'Lymphocytes differential count', unit: '%', low: 20, high: 40,
      what: 'Lymphocytes as a share of all white cells.' },
    mono_abs: { name: 'Monocytes absolute count', unit: '10³/µL', low: 0.2, high: 1,
      what: 'The clean-up cells that clear debris after an infection and help repair tissue.' },
    mono_diff: { name: 'Monocytes differential count', unit: '%', low: 2, high: 10,
      what: 'Monocytes as a share of all white cells.' },
    eos_abs: { name: 'Eosinophils absolute count', unit: '10³/µL', low: 0.02, high: 0.5,
      what: 'The cells involved in allergy and in parasitic infection.' },
    eos_diff: { name: 'Eosinophils differential count', unit: '%', low: 1, high: 5,
      what: 'Eosinophils as a share of all white cells.' },
    baso_abs: { name: 'Basophils absolute count', unit: '10³/µL', low: 0.02, high: 0.1,
      what: 'The rarest white cell, released during allergic and inflammatory responses.' },
    baso_diff: { name: 'Basophils differential count', unit: '%', low: 0, high: 2,
      what: 'Basophils as a share of all white cells.' },
    plt: { name: 'Platelet count', unit: '10³/µL', low: 150, high: 410,
      what: 'The fragments that form clots. Too few and bruising comes easily; too many and clotting risk rises.' },
    mpv: { name: 'Mean platelet volume (MPV)', unit: 'fL', low: 7.5, high: 12,
      what: 'The average size of a platelet. Larger platelets tend to be younger and more active.' },
    pdw: { name: 'Platelet distribution width', unit: '%', low: 11, high: 22,
      what: 'How much your platelets vary in size, read alongside the count and MPV.' },

    /* — lipids and heart — */
    tchol: { name: 'Total cholesterol', unit: 'mg/dL', low: 0, high: 200,
      what: 'All the cholesterol carried in your blood added together — useful as a headline, but the split below it matters more.' },
    ldl: { name: 'LDL cholesterol', unit: 'mg/dL', low: 0, high: 100,
      what: 'The particles that deposit cholesterol into artery walls. This is the number most treatment decisions are built around.' },
    hdl: { name: 'HDL cholesterol', unit: 'mg/dL', low: 40, high: 60, f: { low: 50, high: 70 },
      what: 'The particles that carry cholesterol back to the liver for disposal. Here a higher reading is the better one.' },
    nonhdl: { name: 'Non-HDL cholesterol', unit: 'mg/dL', low: 0, high: 130,
      what: 'Everything except HDL — that is, every cholesterol particle capable of entering an artery wall.' },
    vldl: { name: 'VLDL cholesterol', unit: 'mg/dL', low: 5, high: 40,
      what: 'The triglyceride-rich particles the liver exports; they move with your triglyceride reading.' },
    tg: { name: 'Triglycerides', unit: 'mg/dL', low: 0, high: 150,
      what: 'Circulating fat, drawn largely from refined carbohydrate, alcohol and excess calories. It responds quickly to diet.' },
    ldl_hdl: { name: 'LDL / HDL cholesterol ratio', unit: '', low: 0, high: 3.5,
      what: 'Depositing particles set against clearing particles — a balance reading rather than an amount.' },
    tc_hdl: { name: 'Total cholesterol / HDL ratio', unit: '', low: 0, high: 4.5,
      what: 'The same balance idea using the total figure; widely used in cardiovascular risk scoring.' },
    lpa: { name: 'Lipoprotein (a)', unit: 'mg/dL', low: 0, high: 30,
      what: 'A largely inherited particle that adds cardiovascular risk independently of LDL. It barely moves with diet, so it is measured once and noted.' },
    apoa1: { name: 'Apolipoprotein A1', unit: 'mg/dL', low: 110, high: 205, f: { low: 125, high: 215 },
      what: 'The main protein on HDL particles — a direct count of your clearing vehicles.' },
    apob: { name: 'Apolipoprotein B', unit: 'mg/dL', low: 55, high: 100,
      what: 'One molecule sits on every artery-entering particle, so this counts the particles themselves rather than the cholesterol inside them.' },
    apo_ratio: { name: 'Apolipoprotein B / A1 ratio', unit: '', low: 0.3, high: 0.9,
      what: 'Depositing particles divided by clearing particles — the sharpest single lipid summary on this panel.' },
    homocysteine: { name: 'Homocysteine', unit: 'µmol/L', low: 5, high: 15,
      what: 'An amino acid that irritates blood-vessel lining when it accumulates. It usually rises because B12, B6 or folate are short.' },
    troponin: { name: 'High-sensitivity troponin I', unit: 'pg/mL', low: 0, high: 19.8,
      what: 'A protein released when heart muscle is injured. On a routine panel it is read as a quiet background check.' },
    ntprobnp: { name: 'NT-proBNP', unit: 'pg/mL', low: 0, high: 125,
      what: 'A hormone the heart releases when its walls are stretched — the standard screen for strain on the pump.' },

    /* — inflammation — */
    hscrp: { name: 'High-sensitivity C-reactive protein (hs-CRP)', unit: 'mg/L', low: 0, high: 3,
      what: 'A protein the liver makes when inflammation is present anywhere in the body. The high-sensitivity version detects the low-grade kind that tracks with cardiovascular risk.' },

    /* — kidney — */
    creatinine: { name: 'Serum creatinine', unit: 'mg/dL', low: 0.7, high: 1.3, f: { low: 0.5, high: 1.1 },
      what: 'Muscle waste that only the kidneys remove, so the level in blood reports how well they are filtering.' },
    urea: { name: 'Urea', unit: 'mg/dL', low: 17, high: 43,
      what: 'The waste product of protein breakdown, also cleared by the kidneys.' },
    bun: { name: 'Blood urea nitrogen (BUN)', unit: 'mg/dL', low: 7, high: 18,
      what: 'The nitrogen fraction of that urea — the same measurement expressed the way many labs prefer.' },
    bun_creat: { name: 'BUN / creatinine ratio', unit: '', low: 6, high: 22,
      what: 'The two kidney wastes set against each other, which helps separate dehydration from a filtering problem.' },
    egfr: { name: 'Estimated glomerular filtration rate', unit: 'mL/min', low: 90, high: 140,
      what: 'An estimate of how much blood your kidneys clean each minute, calculated from creatinine, age and sex. It is the headline kidney number.' },
    uric: { name: 'Uric acid', unit: 'mg/dL', low: 3.5, high: 7.2, f: { low: 2.6, high: 6 },
      what: 'The end product of purine breakdown. Above the band it can crystallise in joints, which is what gout is.' },
    sodium: { name: 'Sodium', unit: 'mmol/L', low: 136, high: 145,
      what: 'The salt that governs how much water your body holds and how nerves fire.' },
    potassium: { name: 'Potassium', unit: 'mmol/L', low: 3.5, high: 5.1,
      what: 'The mineral that sets your heart’s electrical rhythm — a tightly held band for good reason.' },
    chloride: { name: 'Chloride', unit: 'mmol/L', low: 98, high: 107,
      what: 'Read with sodium and bicarbonate to check your acid–base balance.' },

    /* — liver — */
    sgpt: { name: 'Alanine transaminase (SGPT)', unit: 'U/L', low: 0, high: 50, f: { low: 0, high: 35 },
      what: 'An enzyme concentrated in liver cells. It leaks into blood when those cells are irritated, which makes it the most liver-specific marker here.' },
    sgot: { name: 'Aspartate aminotransferase (SGOT)', unit: 'U/L', low: 0, high: 50, f: { low: 0, high: 35 },
      what: 'A related enzyme found in liver but also in muscle, so it is always read next to SGPT.' },
    sgot_sgpt: { name: 'SGOT / SGPT ratio', unit: '', low: 0.7, high: 1.4,
      what: 'The balance between the two enzymes, which points towards the likely cause when either is raised.' },
    ggt: { name: 'Gamma glutamyl transferase (GGT)', unit: 'U/L', low: 0, high: 55, f: { low: 0, high: 38 },
      what: 'An enzyme sensitive to alcohol, to some medicines and to fat accumulating in the liver.' },
    alp: { name: 'Alkaline phosphatase', unit: 'U/L', low: 30, high: 120,
      what: 'An enzyme from the bile ducts and from bone; where it comes from is decided by the markers around it.' },
    bili_total: { name: 'Bilirubin (total)', unit: 'mg/dL', low: 0.3, high: 1.2,
      what: 'The pigment left when old red cells are broken down. The liver clears it, and jaundice is what a build-up looks like.' },
    bili_conj: { name: 'Bilirubin (conjugated)', unit: 'mg/dL', low: 0, high: 0.3,
      what: 'The portion the liver has already processed and is ready to excrete.' },
    bili_unconj: { name: 'Bilirubin (unconjugated)', unit: 'mg/dL', low: 0.1, high: 1,
      what: 'The portion not yet processed. Which fraction is raised tells you whether the issue is before the liver or after it.' },
    protein_total: { name: 'Total protein', unit: 'g/dL', low: 6.4, high: 8.3,
      what: 'All the protein circulating in blood — albumin plus the globulins.' },
    albumin: { name: 'Albumin', unit: 'g/dL', low: 3.5, high: 5.2,
      what: 'The liver’s main manufactured protein. It holds fluid inside vessels and carries hormones and medicines around the body.' },
    globulin: { name: 'Globulin', unit: 'g/dL', low: 2, high: 3.5,
      what: 'The protein fraction that includes your antibodies.' },
    ag_ratio: { name: 'Albumin / globulin ratio', unit: '', low: 1, high: 2.1,
      what: 'The two fractions set against each other, which can shift before either one leaves its own band.' },

    /* — thyroid — */
    tsh: { name: 'Thyroid stimulating hormone (TSH)', unit: 'µIU/mL', low: 0.4, high: 4.5,
      what: 'The instruction the pituitary sends to your thyroid. It rises when the gland is under-performing, which makes it the earliest signal of the three.' },
    t4: { name: 'Total thyroxine (T4)', unit: 'µg/dL', low: 4.8, high: 12.7,
      what: 'The main hormone the thyroid releases — mostly a reserve the body converts as needed.' },
    t3: { name: 'Total triiodothyronine (T3)', unit: 'ng/mL', low: 0.6, high: 2,
      what: 'The active form converted from T4; it is what actually sets your metabolic rate.' },

    /* — hormones — */
    testosterone: { name: 'Total testosterone', unit: 'ng/dL', low: 300, high: 1000, f: { low: 15, high: 70 },
      what: 'The hormone behind muscle maintenance, bone density, drive and mood. Present and meaningful in both sexes, at very different levels.' },

    /* — urine — */
    u_colour: { name: 'Urine colour', qual: true, ok: ['Pale yellow', 'Yellow'],
      what: 'Mostly a hydration reading — pale is well watered, dark is concentrated. Some medicines and foods change it harmlessly.' },
    u_appearance: { name: 'Urine appearance', qual: true, ok: ['Clear'],
      what: 'Clear is expected. Cloudiness suggests cells, crystals or protein are present.' },
    u_ph: { name: 'Urine pH level', unit: '', low: 4.6, high: 8,
      what: 'How acidic your urine is. Persistently acidic urine makes certain kinds of kidney stone more likely.' },
    u_sg: { name: 'Urine specific gravity', unit: '', low: 1.005, high: 1.03,
      what: 'How concentrated your urine is compared with plain water — a direct check on both hydration and the kidney’s concentrating ability.' },
    u_protein: { name: 'Urine protein', qual: true, ok: ['Negative', 'Trace'],
      what: 'Healthy kidneys hold protein back. Finding it in urine is one of the earliest signs of filter damage, which is why it is checked yearly in diabetes.' },
    u_glucose: { name: 'Urine glucose', qual: true, ok: ['Negative'],
      what: 'Sugar only spills into urine once blood levels pass roughly 180 mg/dL, so any reading here is worth pairing with your blood sugar.' },
    u_ketones: { name: 'Urine ketones', qual: true, ok: ['Negative'],
      what: 'Ketones appear when the body burns fat instead of sugar — expected while fasting, worth reviewing in diabetes.' },
    u_bilirubin: { name: 'Urine bilirubin', qual: true, ok: ['Negative'],
      what: 'Bilirubin in urine points to the liver or the bile ducts rather than the kidneys.' },
    u_urobilinogen: { name: 'Urine urobilinogen', qual: true, ok: ['Normal'],
      what: 'A downstream product of bilirubin; both a rise and a complete absence carry meaning.' },
    u_nitrite: { name: 'Urine nitrite', qual: true, ok: ['Negative'],
      what: 'Several bacteria convert nitrate to nitrite, so a positive result is a strong hint of a urinary infection.' },
    u_leuk_est: { name: 'Urine leukocyte esterase', qual: true, ok: ['Negative'],
      what: 'An enzyme from white cells — read together with nitrite when infection is suspected.' },
    u_blood: { name: 'Urine blood', qual: true, ok: ['Negative'],
      what: 'Blood the strip detects even when the urine looks normal to the eye.' },
    u_rbc: { name: 'Urine red blood cells', qual: true, ok: ['Nil', '0-2'],
      what: 'Red cells counted under the microscope, which confirms what the strip suggested.' },
    u_pus: { name: 'Urine pus cells (WBC)', qual: true, ok: ['0-5', 'Nil'],
      what: 'White cells under the microscope. A raised count is the clearest sign of infection or inflammation in the urinary tract.' },
    u_epithelial: { name: 'Urine epithelial cells', qual: true, ok: ['0-2', 'Nil'],
      what: 'Ordinary lining cells shed into urine. A few are normal; many usually mean the sample was not cleanly collected.' },
    u_casts: { name: 'Urine casts', qual: true, ok: ['Nil'],
      what: 'Cylindrical moulds formed inside kidney tubules. Which type appears says a great deal about the kidney itself.' },
    u_crystals: { name: 'Urine crystals', qual: true, ok: ['Nil'],
      what: 'Minerals that have come out of solution — the raw material of kidney stones.' },
    u_bacteria: { name: 'Urine bacteria', qual: true, ok: ['Nil'],
      what: 'Bacteria seen under the microscope, confirming the strip findings.' },
    u_yeast: { name: 'Urine yeast', qual: true, ok: ['Negative'],
      what: 'Yeast cells, most often Candida. More common in diabetes and after a course of antibiotics.' },
  };

  /* ── the categories ─────────────────────────────────────────────────────
     A marker may appear in several categories — that is the point. `blurb`
     is the standing description of what the category covers; the verdict a
     client reads is computed from their own results, never written here. */
  /* Catalogue order IS grid order — HV.vitals.grid() maps this array straight
     through. Microbiome and Epilimo lead because they are the two tests that
     read the long arc: everything below them is a snapshot of this morning. */
  var CATS = [
    { key: 'microbiome', name: 'Microbiome Test', icon: 'microbe',
      blurb: 'The community living in your gut — how varied it is, who dominates it, and whether the lining they sit on is calm.',
      markers: ['mb_shannon', 'mb_fb', 'mb_akk', 'mb_bifido', 'mb_butyrate', 'mb_entero', 'mb_calpro'] },
    { key: 'epilimo', name: 'Epilimo Test', icon: 'molecule',
      blurb: 'What your DNA reads as your age, rather than what the calendar says — and how fast that number is moving.',
      markers: ['epi_pace', 'epi_gap', 'epi_telomere', 'epi_methyl', 'epi_immune'] },
    { key: 'blood', name: 'Blood', icon: 'drop',
      blurb: 'The complete blood count — the cells themselves, their size and their spread.',
      markers: ['abg', 'baso_abs', 'baso_diff', 'eos_abs', 'eos_diff', 'hba1c', 'hct', 'hb',
        'lymph_abs', 'lymph_diff', 'mchc', 'mch', 'mcv', 'mpv', 'mono_abs', 'mono_diff',
        'neut_abs', 'neut_diff', 'plt', 'pdw', 'rbc', 'rdw', 'wbc', 'u_blood', 'u_rbc'] },
    { key: 'heart', name: 'Heart', icon: 'heart',
      blurb: 'Particle counts and strain markers — cardiovascular risk read directly rather than inferred.',
      markers: ['apoa1', 'apob', 'apo_ratio', 'troponin', 'homocysteine', 'ntprobnp'] },
    { key: 'hormones', name: 'Hormones', icon: 'molecule',
      blurb: 'The chemical messengers behind muscle, mood, drive and recovery.',
      markers: ['testosterone'] },
    { key: 'infection', name: 'Infection', icon: 'microbe',
      blurb: 'Whether inflammation is present anywhere in the body, including the low-grade kind you cannot feel.',
      markers: ['hscrp'] },
    { key: 'kidney', name: 'Kidney', icon: 'kidney',
      blurb: 'Filtering capacity, the wastes being cleared, and the salts the kidneys hold in balance.',
      markers: ['bun', 'bun_creat', 'chloride', 'egfr', 'potassium', 'creatinine', 'sodium', 'urea', 'uric'] },
    { key: 'lipid', name: 'Lipid Profile', icon: 'lipid',
      blurb: 'Every cholesterol fraction, the fats between them, and the ratios that matter more than any single one.',
      markers: ['apoa1', 'apob', 'apo_ratio', 'hdl', 'ldl', 'ldl_hdl', 'lpa', 'nonhdl',
        'tchol', 'tc_hdl', 'tg', 'vldl'] },
    { key: 'liver', name: 'Liver', icon: 'liver',
      blurb: 'Enzymes that leak when liver cells are irritated, and the proteins only the liver makes.',
      markers: ['sgpt', 'albumin', 'ag_ratio', 'alp', 'sgot', 'bili_conj', 'bili_total',
        'bili_unconj', 'ggt', 'globulin', 'sgot_sgpt', 'protein_total'] },
    { key: 'sugar', name: 'Sugar', icon: 'sugar',
      blurb: 'Blood sugar this morning, averaged over three months, and whether any is spilling into urine.',
      markers: ['abg', 'fbs', 'hba1c', 'u_glucose'] },
    { key: 'thyroid', name: 'Thyroid', icon: 'thyroid',
      blurb: 'The gland that sets your metabolic rate — the instruction to it and the two hormones it returns.',
      markers: ['tsh', 't4', 't3'] },
    { key: 'urine', name: 'Urine', icon: 'flask',
      blurb: 'The full urinalysis — strip chemistry and what the microscope finds in the sediment.',
      markers: ['u_appearance', 'u_bacteria', 'u_bilirubin', 'u_blood', 'u_casts', 'u_colour',
        'u_crystals', 'u_epithelial', 'u_glucose', 'u_ketones', 'u_leuk_est', 'u_nitrite',
        'u_ph', 'u_protein', 'u_pus', 'u_rbc', 'u_sg', 'u_urobilinogen', 'u_yeast'] },
  ];

  /* ── the reports ────────────────────────────────────────────────────────
     MOVED to the store: HV.store.labReports (seeded in data.js) holds each
     client's dated reports — values are user state, while this file keeps
     only the facts (marker definitions and reference bands). A marker absent
     from a report's `values` was simply not ordered, and never renders —
     which is why Ananya's health check shows ten categories and Rajesh's
     full panel shows twelve. */

  /* ── the specimen plates ────────────────────────────────────────────────
     Rendered artwork, not drawn vectors. Fittr's category art is a shaded
     three-dimensional organ, and hand-drawn SVG could not reach that register
     however much interior detail it carried — so these are generated matte-clay
     renders (Higgsfield, GPT Image 2), keyed to transparency and shipped as
     ~5KB WebP each.

     Two colourways per category, which is Fittr's own signal and the one thing
     a raster cannot do for itself: sage green while the group is clean,
     terracotta while something in it is flagged. Files live in
     app/img/vitals/<key>-<green|red>.webp and are cached by the service worker,
     so the panel still draws offline.

     Transparency is load-bearing: the renders come back on white, and a white
     square would sit on every card in dark mode. */

  /* ── the API ────────────────────────────────────────────────────────── */
  HV.vitals = {
    markers: M,
    categories: CATS,

    /* `flagged` picks the colourway — the artwork itself carries the state,
       exactly as Fittr does, because a raster cannot be recoloured in CSS. */
    plate: function (key, flagged, cls) {
      var ok = CATS.some(function (c) { return c.key === key; });
      var k = ok ? key : 'blood';
      var tone = flagged ? 'red' : 'green';
      return '<span class="vplate ' + (cls || '') + '">' +
        '<img src="img/vitals/' + k + '-' + tone + '.webp" width="64" height="64" ' +
        'alt="" decoding="async"></span>';
    },

    /* every dated report a client has shared, oldest first */
    reportsFor: function (clientId) {
      var s = HV.store;
      var arr = (s && s.labReports && s.labReports[clientId]) || [];
      return arr.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    },

    /* the legacy single-report read: the LATEST report, so every existing
       panel renders exactly as it did before reports became a series */
    report: function (clientId) {
      var arr = HV.vitals.reportsFor(clientId);
      return arr.length ? arr[arr.length - 1] : null;
    },

    /* the reference band that applies to this client, sex accounted for */
    band: function (key, sex) {
      var m = M[key];
      if (!m || m.qual) return null;
      var b = (sex === 'F' && m.f) ? m.f : m;
      return { low: b.low, high: b.high };
    },

    /* one marker, resolved against one client's report.
       Returns null when the marker was not ordered. */
    read: function (key, report, sex) {
      var m = M[key];
      if (!m || !report) return null;
      var raw = report.values[key];
      if (raw == null) return null;
      if (m.qual) {
        return { key: key, def: m, qual: true, display: String(raw),
                 out: m.ok.indexOf(String(raw)) === -1 };
      }
      var b = HV.vitals.band(key, sex);
      var v = Number(raw);
      return { key: key, def: m, qual: false, value: v, display: String(raw),
               low: b.low, high: b.high, out: v < b.low || v > b.high,
               dir: v < b.low ? 'low' : (v > b.high ? 'high' : null) };
    },

    /* every ordered marker in a category, flagged ones first is NOT applied —
       lab order is preserved so a printed report can be read alongside it */
    category: function (catKey, report, sex) {
      var cat = CATS.filter(function (c) { return c.key === catKey; })[0];
      if (!cat || !report) return null;
      var rows = cat.markers.map(function (k) { return HV.vitals.read(k, report, sex); })
        .filter(Boolean);
      var out = rows.filter(function (r) { return r.out; });
      return { cat: cat, rows: rows, out: out.length, within: rows.length - out.length };
    },

    /* the categories this report actually covers, in catalogue order */
    grid: function (report, sex) {
      if (!report) return [];
      return CATS.map(function (c) { return HV.vitals.category(c.key, report, sex); })
        .filter(function (g) { return g && g.rows.length; });
    },

    /* report-level counts. Counted over UNIQUE markers, not per category —
       a marker shared by Blood and Sugar must not be counted twice. */
    summary: function (report, sex) {
      if (!report) return null;
      var seen = {}, within = 0, out = 0;
      CATS.forEach(function (c) {
        c.markers.forEach(function (k) {
          if (seen[k]) return;
          var r = HV.vitals.read(k, report, sex);
          if (!r) return;
          seen[k] = true;
          if (r.out) out++; else within++;
        });
      });
      var total = within + out;
      return { within: within, out: out, total: total,
               pct: total ? Math.round(within / total * 100) : 0 };
    },
  };
})();
