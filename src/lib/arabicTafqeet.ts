/**
 * تحويل الأرقام إلى كلمات عربية فصحى (التفقيط المالي الرسمي)
 * مخصص لسندات وإيصالات محطة الاتحادية بالدرهم المغربي والأوقية الموريتانية
 */

const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

function convertUnderThousand(num: number): string {
  let result = '';
  const h = Math.floor(num / 100);
  const remainder = num % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  if (h > 0) {
    result += hundreds[h];
  }

  if (remainder > 0) {
    if (result) result += ' و ';
    if (remainder >= 10 && remainder <= 19) {
      result += teens[remainder - 10];
    } else {
      if (o > 0 && t > 0) {
        result += `${ones[o]} و ${tens[t]}`;
      } else if (o > 0) {
        result += ones[o];
      } else if (t > 0) {
        result += tens[t];
      }
    }
  }

  return result;
}

export function tafqeetArabic(amount: number, currency: string = 'MAD'): string {
  if (!amount || amount === 0) {
    const currName = currency === 'MRU' ? 'أوقية موريتانية' : 'درهم مغربي';
    return `صفر ${currName} لا غير`;
  }

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  let parts: string[] = [];

  const thousands = Math.floor(integerPart / 1000);
  const under1000 = integerPart % 1000;

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('ألف');
    } else if (thousands === 2) {
      parts.push('ألفان');
    } else if (thousands >= 3 && thousands <= 10) {
      parts.push(`${convertUnderThousand(thousands)} آلاف`);
    } else {
      parts.push(`${convertUnderThousand(thousands)} ألف`);
    }
  }

  if (under1000 > 0) {
    parts.push(convertUnderThousand(under1000));
  }

  const words = parts.join(' و ');
  const currencyName = currency === 'MRU' ? 'أوقية موريتانية' : 'درهم مغربي';
  const subCurrencyName = currency === 'MRU' ? 'خُمس' : 'سنتيم';

  let fullText = `فقط ${words} ${currencyName}`;

  if (decimalPart > 0) {
    fullText += ` و ${convertUnderThousand(decimalPart)} ${subCurrencyName}`;
  }

  fullText += ' لا غير';

  return fullText;
}
