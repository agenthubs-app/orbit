"use client";

import { useId, type InputHTMLAttributes } from "react";

import { Icon } from "./Icon";
import { useStandardCopy } from "./Scope";
import styles from "./Fields.module.css";

// kit .search: 44 high pill on surface. Clears with a button when it has text.
export function SearchField({ value, onChange, placeholder, label, clearLabel }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  clearLabel?: string;
}) {
  const copy = useStandardCopy();
  return (
    <label className={styles.search}>
      <Icon name="search" size={16} />
      <input type="search" className={styles.searchInput} value={value} placeholder={placeholder} aria-label={label ?? placeholder} onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <button type="button" className={`btn ${styles.clear}`} aria-label={clearLabel ?? copy.filter.clear} onClick={() => onChange("")}>
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </label>
  );
}

// kit .input: 44 high, radius 14, surface-2. A field error sits under the field,
// coral text with an alert icon, and is announced.
export function TextField({ label, error, hint, ...input }: { label: string; error?: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input {...input} id={id} aria-invalid={error ? true : undefined} aria-describedby={described} className={`${styles.input} ${error ? styles.inputError : ""}`} />
      {error ? <p id={`${id}-error`} role="alert" className={styles.error}><Icon name="alert" size={16} />{error}</p>
        : hint ? <p id={`${id}-hint`} className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
