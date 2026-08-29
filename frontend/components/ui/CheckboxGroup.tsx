"use client";

import { type ReactNode, useId } from "react";

interface CheckboxGroupItem {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface CheckboxGroupProps {
  items: CheckboxGroupItem[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  label?: string;
  description?: string;
  selectAllLabel?: string;
  showSelectAll?: boolean;
  disabled?: boolean;
  className?: string;
  columns?: 1 | 2;
}

export function CheckboxGroup({
  items,
  selectedValues,
  onChange,
  label,
  description,
  selectAllLabel = "Seleccionar todo",
  showSelectAll = true,
  disabled = false,
  className,
  columns = 1,
}: CheckboxGroupProps) {
  const groupId = useId();
  const allSelected = items.every(item => !item.disabled && selectedValues.includes(item.value));
  const someSelected = items.some(item => selectedValues.includes(item.value));

  const handleSelectAll = () => {
    if (allSelected) {
      onChange(selectedValues.filter(v => !items.find(i => i.value === v)?.disabled));
    } else {
      onChange([...selectedValues, ...items.filter(i => !i.disabled).map(i => i.value)]);
    }
  };

  const handleItemChange = (value: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedValues, value]);
    } else {
      onChange(selectedValues.filter(v => v !== value));
    }
  };

  return (
    <fieldset className={`space-y-3 ${className ?? ""}`} disabled={disabled}>
      {(label || showSelectAll) && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {label && <legend className="text-sm font-medium text-[var(--text-primary)]">{label}</legend>}
            {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
          </div>
          {showSelectAll && items.length > 3 && !disabled && (
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-[var(--primary)] hover:underline whitespace-nowrap"
              aria-pressed={allSelected}
            >
              {allSelected ? "Deseleccionar todo" : selectAllLabel}
            </button>
          )}
        </div>
      )}

      <div
        className={`space-y-2 ${columns === 2 ? "grid grid-cols-2 gap-2" : ""}`}
        role="group"
        aria-labelledby={label ? `${groupId}-label` : undefined}
      >
        {items.map((item) => (
          <label
            key={item.value}
            className={`flex items-start gap-2 cursor-pointer ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="checkbox"
              value={item.value}
              checked={selectedValues.includes(item.value)}
              onChange={(e) => !item.disabled && handleItemChange(item.value, e.target.checked)}
              disabled={item.disabled || disabled}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] transition-colors"
              aria-describedby={item.description ? `${groupId}-${item.value}-desc` : undefined}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm text-[var(--text-primary)] truncate">{item.label}</span>
              {item.description && (
                <p id={`${groupId}-${item.value}-desc`} className="text-xs text-[var(--text-muted)]">
                  {item.description}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}