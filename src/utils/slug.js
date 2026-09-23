// src/utils/slug.js — Vietnamese-aware slugify (matches the seed's inline logic).
const COMBINING_MARKS = /[̀-ͯ]/g;

export const slugify = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default slugify;
