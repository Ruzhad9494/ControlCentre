// calc.js - preview kiraan di browser (F-20). Server kira semula bila simpan (BSD 3.3).
// MESTI sepadan dengan apps/costcalculator/gas/Calc.gs. Diuji oleh tools/test/costcalc.test.mjs.

const DAY_MS = 24 * 60 * 60 * 1000;

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function period(mula, tamat) {
  const s = parseDate(mula);
  const e = parseDate(tamat);
  if (s !== null && e !== null) {
    if (e >= s) {
      const diff = Math.ceil(Math.abs(e - s) / DAY_MS);
      return { hari: diff + 1, malam: diff };
    }
    return { hari: 0, malam: 0 };
  }
  if (s !== null) return { hari: 1, malam: 0 };
  return { hari: 0, malam: 0 };
}

export function calcEstimate(input, rates) {
  const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const { hari: days, malam: nights } = period(input.tarikh_mula, input.tarikh_tamat);

  const staff = n(input.staff);
  const transportUnit = n(input.transport_unit);
  const otHours = n(input.ot_jam);
  const homestayUnit = n(input.homestay_unit);
  const mileage = n(input.mileage_km);
  const poAmount = n(input.nilai_po_rm);
  const sstRate = n(input.sst_peratus);
  const subkon = (input.subkon || []).map(n);
  const totalSubcont = subkon.reduce((a, b) => a + b, 0);

  const rateOT = n(rates.ot_per_hour);
  const rateTransport = n(rates.transport_per_km);
  const rateMakan = n(rates.makan_per_day_pax);
  const rateHomestay = n(rates.homestay_per_night);
  const rateOvernight = n(rates.overnight_per_pax);

  const costOT = staff * otHours * rateOT;
  const costTransport = mileage * transportUnit * rateTransport;
  const costMakan = days * staff * rateMakan;
  const costHomestay = nights > 0 ? (homestayUnit * nights * rateHomestay) : 0;
  const costOvernight = nights * staff * rateOvernight;
  const totalMobCost = costOT + costTransport + costMakan + costHomestay + costOvernight;

  const totalProjectCost = totalSubcont + totalMobCost;
  const marginAmount = poAmount - totalProjectCost;
  const sst = poAmount * (sstRate / 100);
  const finalPoAmount = poAmount + sst;

  return {
    hari: days,
    malam: nights,
    kos: {
      ot: round2(costOT),
      transport: round2(costTransport),
      makan: round2(costMakan),
      homestay: round2(costHomestay),
      overnight: round2(costOvernight),
    },
    jumlah_mobilisasi: round2(totalMobCost),
    jumlah_subkon: round2(totalSubcont),
    jumlah_kos: round2(totalProjectCost),
    margin: round2(marginAmount),
    margin_peratus: poAmount > 0 ? round2((marginAmount / poAmount) * 100) : 0,
    sst: round2(sst),
    po_akhir: round2(finalPoAmount),
  };
}
