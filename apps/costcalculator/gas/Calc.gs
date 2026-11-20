/**
 * Calc.gs - kiraan kos & margin (F-20). Formula SAMA dengan sistem lama
 * (voltake-energy/costcalculator index.html, fungsi calculate()).
 *
 * MESTI sepadan baris demi baris dengan apps/costcalculator/web/calc.js (preview di browser).
 * Ujian tools/test/costcalc.test.mjs banding kedua-duanya + formula lama.
 *
 * input: { tarikh_mula, tarikh_tamat (YYYY-MM-DD), staff, transport_unit, ot_jam, homestay_unit,
 *          mileage_km, nilai_po_rm, sst_peratus, subkon: [RM, ...] }
 * rates: { ot_per_hour, transport_per_km, makan_per_day_pax, homestay_per_night, overnight_per_pax }
 */

var CALC_DAY_MS = 24 * 60 * 60 * 1000;

function calcRound2_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function calcParseDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Tempoh: hari = beza + 1, malam = beza. Hanya tarikh mula: 1 hari 0 malam. */
function calcPeriod_(mula, tamat) {
  var s = calcParseDate_(mula), e = calcParseDate_(tamat);
  if (s !== null && e !== null) {
    if (e >= s) {
      var diff = Math.ceil(Math.abs(e - s) / CALC_DAY_MS);
      return { hari: diff + 1, malam: diff };
    }
    return { hari: 0, malam: 0 };
  }
  if (s !== null) return { hari: 1, malam: 0 };
  return { hari: 0, malam: 0 };
}

function calcEstimate_(input, rates) {
  var n = function (v) { var x = parseFloat(v); return isFinite(x) ? x : 0; };
  var p = calcPeriod_(input.tarikh_mula, input.tarikh_tamat);
  var days = p.hari, nights = p.malam;

  var staff = n(input.staff);
  var transportUnit = n(input.transport_unit);
  var otHours = n(input.ot_jam);
  var homestayUnit = n(input.homestay_unit);
  var mileage = n(input.mileage_km);
  var poAmount = n(input.nilai_po_rm);
  var sstRate = n(input.sst_peratus);
  var subkon = (input.subkon || []).map(n);
  var totalSubcont = subkon.reduce(function (a, b) { return a + b; }, 0);

  var rateOT = n(rates.ot_per_hour);
  var rateTransport = n(rates.transport_per_km);
  var rateMakan = n(rates.makan_per_day_pax);
  var rateHomestay = n(rates.homestay_per_night);
  var rateOvernight = n(rates.overnight_per_pax);

  var costOT = staff * otHours * rateOT;
  var costTransport = mileage * transportUnit * rateTransport;
  var costMakan = days * staff * rateMakan;
  var costHomestay = nights > 0 ? (homestayUnit * nights * rateHomestay) : 0;
  var costOvernight = nights * staff * rateOvernight;
  var totalMobCost = costOT + costTransport + costMakan + costHomestay + costOvernight;

  var totalProjectCost = totalSubcont + totalMobCost;
  var marginAmount = poAmount - totalProjectCost;
  var sst = poAmount * (sstRate / 100);
  var finalPoAmount = poAmount + sst;

  return {
    hari: days,
    malam: nights,
    kos: {
      ot: calcRound2_(costOT),
      transport: calcRound2_(costTransport),
      makan: calcRound2_(costMakan),
      homestay: calcRound2_(costHomestay),
      overnight: calcRound2_(costOvernight)
    },
    jumlah_mobilisasi: calcRound2_(totalMobCost),
    jumlah_subkon: calcRound2_(totalSubcont),
    jumlah_kos: calcRound2_(totalProjectCost),
    margin: calcRound2_(marginAmount),
    margin_peratus: poAmount > 0 ? calcRound2_(marginAmount / poAmount * 100) : 0,
    sst: calcRound2_(sst),
    po_akhir: calcRound2_(finalPoAmount)
  };
}
