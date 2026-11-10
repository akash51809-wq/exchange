'use strict';

/**
 * Converts a numeric rupee value into Indian numbering system words (Crore, Lakh, Thousand, Hundred, Paise).
 * Written with ES5-safe browser syntax so it can also be serialized into client scripts without duplication.
 * @param {string|number} val
 * @returns {string}
 */
function convertRupeesToWords(val) {
  var raw = String(val || '').replace(/,/g, '').trim();
  if (!raw) return '';
  var num = parseFloat(raw);
  if (isNaN(num) || num <= 0) return '';

  var ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }

  function convertWhole(n) {
    if (n === 0) return 'Zero';
    var str = '';
    if (n >= 10000000) {
      str += convertWhole(Math.floor(n / 10000000)) + ' Crore ';
      n %= 10000000;
    }
    if (n >= 100000) {
      str += twoDigits(Math.floor(n / 100000)) + ' Lakh ';
      n %= 100000;
    }
    if (n >= 1000) {
      str += twoDigits(Math.floor(n / 1000)) + ' Thousand ';
      n %= 1000;
    }
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 0) {
      str += twoDigits(n);
    }
    return str.trim();
  }

  var parts = raw.split('.');
  var wholeVal = parseInt(parts[0] || '0', 10);
  var paiseVal = 0;
  if (parts[1]) {
    var dec = (parts[1] + '00').slice(0, 2);
    paiseVal = parseInt(dec, 10);
  }

  var result = '';
  if (wholeVal > 0) result = 'Rupees ' + convertWhole(wholeVal);
  if (paiseVal > 0) {
    if (result) result += ' and ' + twoDigits(paiseVal) + ' Paise';
    else result = twoDigits(paiseVal) + ' Paise';
  }
  return result ? (result + ' Only') : '';
}

/**
 * Generates client-side JS snippet that binds real-time "Rupees in Words" display to an amount input.
 * @returns {string}
 */
function getClientAmountWordsHelperScript() {
  return `
${convertRupeesToWords.toString()}
function bindAmountWordsDisplay(inputId, displayId) {
  var inp = document.getElementById(inputId);
  var out = document.getElementById(displayId);
  if (!inp || !out) return;
  function update() {
    var words = convertRupeesToWords(inp.value);
    if (words) {
      out.textContent = words;
      out.style.display = 'block';
    } else {
      out.textContent = '';
      out.style.display = 'none';
    }
  }
  inp.addEventListener('input', update);
  inp.addEventListener('change', update);
  inp.addEventListener('keyup', update);
  inp.__updateWordsDisplay = update;
  update();
}`;
}

module.exports = {
  convertRupeesToWords,
  getClientAmountWordsHelperScript,
};
