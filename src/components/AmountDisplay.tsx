import React from 'react';
import { useApp } from '../context/AppContext';

interface AmountProps {
  value: number | string;
  currency?: string;
  sign?: '+' | '−' | '-' | '';
  className?: string;
  currencyClassName?: string;
  revealOnPrint?: boolean;
}

export const Amount: React.FC<AmountProps> = ({
  value,
  currency,
  sign = '',
  className = '',
  currencyClassName = '',
  revealOnPrint = false,
}) => {
  const { hideAmounts } = useApp();

  const formattedNum =
    typeof value === 'number'
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : value;

  const displayNum = hideAmounts ? '••••' : `${sign}${formattedNum}`;
  const printNum = `${sign}${formattedNum}`;

  return (
    <span
      dir="ltr"
      style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
      className={className}
    >
      {revealOnPrint && hideAmounts ? (
        <>
          <span className="print:hidden">{displayNum}</span>
          <span className="hidden print:inline">{printNum}</span>
        </>
      ) : (
        <span>{displayNum}</span>
      )}
      {currency ? (
        <span className={currencyClassName ? ` ${currencyClassName}` : ''}>
          {' '}
          {currency}
        </span>
      ) : null}
    </span>
  );
};
