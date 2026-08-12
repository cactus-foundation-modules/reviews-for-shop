// Every storefront class this module draws, in one string, injected by whichever
// of its components renders first on a page.
//
// Class names are this module's own (rvw-) and every colour is a site token, so
// reviews are dressed by the theme they land in and change with it - including
// into dark mode, which is why there is not a single hex value below. The same
// string is used by the Puck editor halves and the RSC halves, which is what keeps
// the canvas and the storefront looking identical.
export const REVIEWS_CSS = `
.rvw-wrap{display:grid;gap:20px}
.rvw-heading{font-size:20px;font-weight:700;margin:0}

/* Heading (when this module draws one) on the left, the write button on the
   right. margin-left:auto rather than space-between, so the button still sits
   hard right when there is no heading beside it. */
.rvw-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.rvw-write{margin-left:auto;font:inherit;font-size:14px;font-weight:600;cursor:pointer;
  padding:9px 18px;border-radius:8px;border:1px solid var(--color-border-strong);
  background:var(--color-surface);color:var(--color-fg)}
.rvw-write:hover{border-color:var(--color-primary);background:var(--color-bg-subtle)}
.rvw-write:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
/* On a product page the "Reviews" header above this panel is shop's, one level
   up in its own section element, so the button cannot be a sibling of it. It is
   lifted onto that line instead: 18px down is where shop's 24px heading sits
   inside the section's 20px top padding. A shop that ever changes that markup
   only loses the lift - :has() stops matching and the button drops back into the
   panel, right-aligned, which is where it renders in a tab or accordion anyway. */
.spd-section:has(> .rvw-wrap > .rvw-top){position:relative}
.spd-section > .rvw-wrap > .rvw-top{position:absolute;top:18px;right:0;margin:0}

.rvw-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

.rvw-stars{display:inline-flex;gap:2px;line-height:0;vertical-align:middle}
.rvw-star{width:16px;height:16px;flex:none}
.rvw-star-on{color:var(--color-warning)}
.rvw-star-off{color:var(--color-border-strong)}

.rvw-summary{display:flex;flex-wrap:wrap;gap:24px;align-items:center;border:1px solid var(--color-border);
  border-radius:12px;padding:18px 20px;background:var(--color-surface)}
.rvw-score{display:grid;gap:4px;min-width:110px}
.rvw-score b{font-size:32px;line-height:1;font-weight:700}
.rvw-score small{color:var(--color-text-muted);font-size:13px}
.rvw-bars{display:grid;gap:5px;flex:1 1 220px;min-width:200px}
.rvw-bar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text-muted)}
.rvw-bar-label{width:44px;flex:none}
.rvw-bar-track{flex:1;height:8px;border-radius:999px;background:var(--color-bg-subtle);overflow:hidden}
.rvw-bar-fill{display:block;height:100%;background:var(--color-warning)}
.rvw-bar-count{width:24px;text-align:right;flex:none}

.rvw-list{display:grid;gap:14px;list-style:none;margin:0;padding:0}
.rvw-item{border:1px solid var(--color-border);border-radius:12px;padding:16px 18px;background:var(--color-surface)}
.rvw-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.rvw-who{font-weight:600;font-size:14px}
.rvw-when{color:var(--color-text-muted);font-size:12px;margin-left:auto}
.rvw-badge{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;
  background:var(--color-success-subtle);color:var(--color-success);border:1px solid var(--color-success-border)}
.rvw-title{font-size:15px;font-weight:600;margin:0 0 4px}
.rvw-body{margin:0;font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.rvw-reply{margin:12px 0 0;padding:12px 14px;border-left:3px solid var(--color-primary);
  background:var(--color-bg-subtle);border-radius:0 8px 8px 0;font-size:13.5px}
.rvw-reply b{display:block;margin-bottom:4px;font-size:11px;color:var(--color-text-muted);
  text-transform:uppercase;letter-spacing:.05em}
.rvw-reply p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.rvw-empty{color:var(--color-text-muted);font-size:14px;margin:0}

.rvw-more{justify-self:start;font:inherit;font-size:13px;font-weight:600;cursor:pointer;
  padding:9px 16px;border-radius:8px;border:1px solid var(--color-border);
  background:var(--color-surface);color:var(--color-fg)}
.rvw-more:hover{border-color:var(--color-primary);background:var(--color-bg-subtle)}
.rvw-more:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

.rvw-form{border:1px solid var(--color-border);border-radius:12px;padding:18px 20px;
  background:var(--color-surface);display:grid;gap:12px}
.rvw-form h3{font-size:16px;font-weight:700;margin:0}
.rvw-row{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.rvw-field{display:grid;gap:4px}
.rvw-field label,.rvw-picker legend{font-size:13px;font-weight:600;padding:0}
.rvw-field input,.rvw-field textarea{font:inherit;font-size:14px;padding:9px 11px;
  border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);color:var(--color-fg)}
.rvw-field textarea{min-height:110px;resize:vertical}
.rvw-field input:focus-visible,.rvw-field textarea:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.rvw-picker{border:0;margin:0;padding:0;display:grid;gap:4px}
.rvw-picks{display:flex;gap:2px}
.rvw-pick{display:inline-flex;padding:3px;border-radius:4px;cursor:pointer;color:var(--color-border-strong)}
.rvw-pick-on{color:var(--color-warning)}
.rvw-pick:focus-within{outline:2px solid var(--color-primary);outline-offset:1px}
.rvw-pick .rvw-star{width:24px;height:24px}
.rvw-note{font-size:12.5px;color:var(--color-text-muted);margin:0}
.rvw-error{font-size:13px;color:var(--color-error);margin:0}
.rvw-thanks{font-size:14px;margin:0;padding:14px 16px;border-radius:10px;
  background:var(--color-success-subtle);border:1px solid var(--color-success-border);color:var(--color-text)}
.rvw-submit{justify-self:start;font:inherit;font-size:14px;font-weight:600;cursor:pointer;
  padding:10px 20px;border-radius:8px;border:1px solid var(--color-primary);
  background:var(--color-primary);color:var(--color-on-primary)}
.rvw-submit:hover:enabled{background:var(--color-primary-hover);border-color:var(--color-primary-hover)}
.rvw-submit:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.rvw-submit:disabled{opacity:.6;cursor:default}

.rvw-inline{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--color-text-muted)}
.rvw-inline a{color:inherit;text-decoration:underline}

.rvw-wall{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.rvw-wall .rvw-item{display:flex;flex-direction:column;gap:8px}
.rvw-wall-product{font-size:12.5px;font-weight:600;color:var(--color-link);text-decoration:none;margin-top:auto}
.rvw-wall-product:hover{color:var(--color-link-hover);text-decoration:underline}
`
