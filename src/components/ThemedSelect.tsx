import Select, { type GroupBase, type Props as SelectProps, type StylesConfig } from "react-select";

export interface SelectOption<V = string | number> {
  value: V;
  label: string;
  isDisabled?: boolean;
}

type Size = "default" | "small" | "mini";

// One shared visual language for every dropdown in the app, built from the same CSS
// variables .etm-filter-select/.etm-field select already use (etm-base.css / forms.css) —
// so every converted select keeps matching light/dark theming automatically, with no
// separate JS-driven theme to maintain. "mini" matches the ~24px/11px toolbar controls used
// in the IPCR grid designer's own Tailwind-based toolbar, which is otherwise much denser
// than the rest of the app.
function buildStyles<Option, IsMulti extends boolean>(size: Size): StylesConfig<Option, IsMulti> {
  const minHeight = size === "mini" ? 24 : size === "small" ? 33 : 39;
  const fontSize = size === "mini" ? 11 : size === "small" ? 13 : 14;
  return {
    control: (base, state) => ({
      ...base,
      minHeight,
      borderRadius: size === "mini" ? 5 : size === "small" ? 7 : 8,
      borderColor: state.isFocused ? "var(--etm-primary)" : "var(--etm-border)",
      backgroundColor: "var(--etm-surface-alt)",
      boxShadow: state.isFocused ? "0 0 0 3px #087e8b12" : "none",
      cursor: "pointer",
    }),
    valueContainer: base => ({ ...base, padding: size === "mini" ? "0 6px" : size === "small" ? "1px 8px" : "2px 10px" }),
    input: base => ({ ...base, color: "var(--etm-ink)", margin: 0, padding: 0 }),
    singleValue: base => ({ ...base, color: "var(--etm-ink)", fontSize }),
    multiValue: base => ({ ...base, backgroundColor: "color-mix(in srgb, var(--etm-primary) 14%, var(--etm-surface))", borderRadius: 6 }),
    multiValueLabel: base => ({ ...base, color: "var(--etm-primary)", fontSize: 12 }),
    multiValueRemove: base => ({ ...base, color: "var(--etm-primary)", ":hover": { backgroundColor: "color-mix(in srgb, var(--etm-primary) 26%, var(--etm-surface))", color: "var(--etm-primary)" } }),
    placeholder: base => ({ ...base, color: "var(--etm-muted)", fontSize }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: base => ({ ...base, color: "var(--etm-muted)", padding: size === "mini" ? "0 4px" : size === "small" ? "0 6px" : "0 8px" }),
    clearIndicator: base => ({ ...base, color: "var(--etm-muted)" }),
    menuPortal: base => ({ ...base, zIndex: 9999 }),
    menu: base => ({ ...base, backgroundColor: "var(--etm-surface)", border: "1px solid var(--etm-border)", borderRadius: 8, overflow: "hidden", zIndex: 20 }),
    // Used when the menu is portalled to <body> (see the "mini" toolbar selects below).
    menuPortal: base => ({ ...base, zIndex: 9999 }),
    menuList: base => ({ ...base, padding: 4, maxHeight: 240 }),
    option: (base, state) => ({
      ...base,
      borderRadius: 6,
      fontSize: size === "mini" ? 12 : fontSize,
      cursor: "pointer",
      backgroundColor: state.isSelected ? "var(--etm-surface-sunken)" : state.isFocused ? "var(--etm-surface-alt)" : "transparent",
      color: "var(--etm-ink)",
    }),
  };
}

const stylesBySize: Record<Size, StylesConfig<unknown, false>> = {
  default: buildStyles<unknown, false>("default"),
  small: buildStyles<unknown, false>("small"),
  mini: buildStyles<unknown, false>("mini"),
};
const multiStylesBySize: Record<Size, StylesConfig<unknown, true>> = {
  default: buildStyles<unknown, true>("default"),
  small: buildStyles<unknown, true>("small"),
  mini: buildStyles<unknown, true>("mini"),
};

export type ThemedSelectProps<Option, IsMulti extends boolean = false> = SelectProps<Option, IsMulti, GroupBase<Option>> & {
  size?: Size;
  // Renders the menu in a body-level portal so it can't be clipped by an overflow:auto/hidden
  // ancestor (e.g. a horizontally-scrolling toolbar). Skip inside Radix dialogs, whose focus
  // trap treats a portaled menu as an outside click.
  portal?: boolean;
};

// Drop-in replacement for a native <select> styled to match the rest of the app, with
// search-as-you-type built in. Pass `isMulti` for a multi-select, `size="small"`/`"mini"` for
// the more compact rows this app already uses (subtask editors, table cells, dense toolbars).
export default function ThemedSelect<Option, IsMulti extends boolean = false>({ size = "default", styles, portal, ...props }: ThemedSelectProps<Option, IsMulti>) {
  const base = props.isMulti ? multiStylesBySize[size] : stylesBySize[size];
  return (
    <Select<Option, IsMulti, GroupBase<Option>>
      // The compact toolbar selects live inside a horizontally scrolling bar, which clips an
      // ordinary dropdown menu to a sliver — render their menus on <body> so they open fully.
      menuPortalTarget={size === "mini" && typeof document !== "undefined" ? document.body : undefined}
      menuPosition={size === "mini" ? "fixed" : "absolute"}
      styles={styles ? { ...(base as StylesConfig<Option, IsMulti>), ...styles } : (base as StylesConfig<Option, IsMulti>)}
      {...(portal ? { menuPortalTarget: document.body, menuPosition: "fixed" as const } : {})}
      {...props}
    />
  );
}
