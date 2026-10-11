/*
 * 元素周期表数据（1–118 号元素）
 *
 * 字段：原子序数 z、元素符号 sym、中文名 cn、英文名 en、
 *       相对原子质量 mass、分类 cat、周期 period、族 group、
 *       电子排布配置 config。
 *
 * 分类取值见 ELEMENT_CATEGORIES。
 */

export type ElementCategory =
  | "alkali"        // 碱金属
  | "alkaline"      // 碱土金属
  | "transition"    // 过渡金属
  | "post"          // 后过渡金属
  | "metalloid"     // 类金属
  | "nonmetal"      // 非金属
  | "halogen"       // 卤素
  | "noble"         // 稀有气体
  | "lanthanide"    // 镧系
  | "actinide";     // 锕系

export interface ChemElement {
  z: number;
  sym: string;
  cn: string;
  en: string;
  mass: string;
  cat: ElementCategory;
  period: number;
  group: number; // 0 表示镧系/锕系（不占主表族位）
  config: string;
  /** 主表网格列（1–18）；镧系/锕系用下面的 row/col 单独摆放 */
  col: number;
  row: number;
}

export const ELEMENT_CATEGORIES: Record<ElementCategory, { label: string; color: string }> = {
  alkali: { label: "碱金属", color: "#FFB3B3" },
  alkaline: { label: "碱土金属", color: "#FFD59E" },
  transition: { label: "过渡金属", color: "#FFE7A8" },
  post: { label: "后过渡金属", color: "#D6E8B3" },
  metalloid: { label: "类金属", color: "#B7E3C8" },
  nonmetal: { label: "非金属", color: "#A8D8F0" },
  halogen: { label: "卤素", color: "#B8C7F0" },
  noble: { label: "稀有气体", color: "#D3BDF0" },
  lanthanide: { label: "镧系", color: "#F0C2DC" },
  actinide: { label: "锕系", color: "#E8B4C8" },
};

interface Raw {
  z: number;
  sym: string;
  cn: string;
  en: string;
  mass: string;
  cat: ElementCategory;
  period: number;
  group: number;
  config: string;
}

const RAW: Raw[] = [
  { z: 1, sym: "H", cn: "氢", en: "Hydrogen", mass: "1.008", cat: "nonmetal", period: 1, group: 1, config: "1s1" },
  { z: 2, sym: "He", cn: "氦", en: "Helium", mass: "4.0026", cat: "noble", period: 1, group: 18, config: "1s2" },
  { z: 3, sym: "Li", cn: "锂", en: "Lithium", mass: "6.94", cat: "alkali", period: 2, group: 1, config: "[He] 2s1" },
  { z: 4, sym: "Be", cn: "铍", en: "Beryllium", mass: "9.0122", cat: "alkaline", period: 2, group: 2, config: "[He] 2s2" },
  { z: 5, sym: "B", cn: "硼", en: "Boron", mass: "10.81", cat: "metalloid", period: 2, group: 13, config: "[He] 2s2 2p1" },
  { z: 6, sym: "C", cn: "碳", en: "Carbon", mass: "12.011", cat: "nonmetal", period: 2, group: 14, config: "[He] 2s2 2p2" },
  { z: 7, sym: "N", cn: "氮", en: "Nitrogen", mass: "14.007", cat: "nonmetal", period: 2, group: 15, config: "[He] 2s2 2p3" },
  { z: 8, sym: "O", cn: "氧", en: "Oxygen", mass: "15.999", cat: "nonmetal", period: 2, group: 16, config: "[He] 2s2 2p4" },
  { z: 9, sym: "F", cn: "氟", en: "Fluorine", mass: "18.998", cat: "halogen", period: 2, group: 17, config: "[He] 2s2 2p5" },
  { z: 10, sym: "Ne", cn: "氖", en: "Neon", mass: "20.180", cat: "noble", period: 2, group: 18, config: "[He] 2s2 2p6" },
  { z: 11, sym: "Na", cn: "钠", en: "Sodium", mass: "22.990", cat: "alkali", period: 3, group: 1, config: "[Ne] 3s1" },
  { z: 12, sym: "Mg", cn: "镁", en: "Magnesium", mass: "24.305", cat: "alkaline", period: 3, group: 2, config: "[Ne] 3s2" },
  { z: 13, sym: "Al", cn: "铝", en: "Aluminium", mass: "26.982", cat: "post", period: 3, group: 13, config: "[Ne] 3s2 3p1" },
  { z: 14, sym: "Si", cn: "硅", en: "Silicon", mass: "28.085", cat: "metalloid", period: 3, group: 14, config: "[Ne] 3s2 3p2" },
  { z: 15, sym: "P", cn: "磷", en: "Phosphorus", mass: "30.974", cat: "nonmetal", period: 3, group: 15, config: "[Ne] 3s2 3p3" },
  { z: 16, sym: "S", cn: "硫", en: "Sulfur", mass: "32.06", cat: "nonmetal", period: 3, group: 16, config: "[Ne] 3s2 3p4" },
  { z: 17, sym: "Cl", cn: "氯", en: "Chlorine", mass: "35.45", cat: "halogen", period: 3, group: 17, config: "[Ne] 3s2 3p5" },
  { z: 18, sym: "Ar", cn: "氩", en: "Argon", mass: "39.948", cat: "noble", period: 3, group: 18, config: "[Ne] 3s2 3p6" },
  { z: 19, sym: "K", cn: "钾", en: "Potassium", mass: "39.098", cat: "alkali", period: 4, group: 1, config: "[Ar] 4s1" },
  { z: 20, sym: "Ca", cn: "钙", en: "Calcium", mass: "40.078", cat: "alkaline", period: 4, group: 2, config: "[Ar] 4s2" },
  { z: 21, sym: "Sc", cn: "钪", en: "Scandium", mass: "44.956", cat: "transition", period: 4, group: 3, config: "[Ar] 3d1 4s2" },
  { z: 22, sym: "Ti", cn: "钛", en: "Titanium", mass: "47.867", cat: "transition", period: 4, group: 4, config: "[Ar] 3d2 4s2" },
  { z: 23, sym: "V", cn: "钒", en: "Vanadium", mass: "50.942", cat: "transition", period: 4, group: 5, config: "[Ar] 3d3 4s2" },
  { z: 24, sym: "Cr", cn: "铬", en: "Chromium", mass: "51.996", cat: "transition", period: 4, group: 6, config: "[Ar] 3d5 4s1" },
  { z: 25, sym: "Mn", cn: "锰", en: "Manganese", mass: "54.938", cat: "transition", period: 4, group: 7, config: "[Ar] 3d5 4s2" },
  { z: 26, sym: "Fe", cn: "铁", en: "Iron", mass: "55.845", cat: "transition", period: 4, group: 8, config: "[Ar] 3d6 4s2" },
  { z: 27, sym: "Co", cn: "钴", en: "Cobalt", mass: "58.933", cat: "transition", period: 4, group: 9, config: "[Ar] 3d7 4s2" },
  { z: 28, sym: "Ni", cn: "镍", en: "Nickel", mass: "58.693", cat: "transition", period: 4, group: 10, config: "[Ar] 3d8 4s2" },
  { z: 29, sym: "Cu", cn: "铜", en: "Copper", mass: "63.546", cat: "transition", period: 4, group: 11, config: "[Ar] 3d10 4s1" },
  { z: 30, sym: "Zn", cn: "锌", en: "Zinc", mass: "65.38", cat: "transition", period: 4, group: 12, config: "[Ar] 3d10 4s2" },
  { z: 31, sym: "Ga", cn: "镓", en: "Gallium", mass: "69.723", cat: "post", period: 4, group: 13, config: "[Ar] 3d10 4s2 4p1" },
  { z: 32, sym: "Ge", cn: "锗", en: "Germanium", mass: "72.630", cat: "metalloid", period: 4, group: 14, config: "[Ar] 3d10 4s2 4p2" },
  { z: 33, sym: "As", cn: "砷", en: "Arsenic", mass: "74.922", cat: "metalloid", period: 4, group: 15, config: "[Ar] 3d10 4s2 4p3" },
  { z: 34, sym: "Se", cn: "硒", en: "Selenium", mass: "78.971", cat: "nonmetal", period: 4, group: 16, config: "[Ar] 3d10 4s2 4p4" },
  { z: 35, sym: "Br", cn: "溴", en: "Bromine", mass: "79.904", cat: "halogen", period: 4, group: 17, config: "[Ar] 3d10 4s2 4p5" },
  { z: 36, sym: "Kr", cn: "氪", en: "Krypton", mass: "83.798", cat: "noble", period: 4, group: 18, config: "[Ar] 3d10 4s2 4p6" },
  { z: 37, sym: "Rb", cn: "铷", en: "Rubidium", mass: "85.468", cat: "alkali", period: 5, group: 1, config: "[Kr] 5s1" },
  { z: 38, sym: "Sr", cn: "锶", en: "Strontium", mass: "87.62", cat: "alkaline", period: 5, group: 2, config: "[Kr] 5s2" },
  { z: 39, sym: "Y", cn: "钇", en: "Yttrium", mass: "88.906", cat: "transition", period: 5, group: 3, config: "[Kr] 4d1 5s2" },
  { z: 40, sym: "Zr", cn: "锆", en: "Zirconium", mass: "91.224", cat: "transition", period: 5, group: 4, config: "[Kr] 4d2 5s2" },
  { z: 41, sym: "Nb", cn: "铌", en: "Niobium", mass: "92.906", cat: "transition", period: 5, group: 5, config: "[Kr] 4d4 5s1" },
  { z: 42, sym: "Mo", cn: "钼", en: "Molybdenum", mass: "95.95", cat: "transition", period: 5, group: 6, config: "[Kr] 4d5 5s1" },
  { z: 43, sym: "Tc", cn: "锝", en: "Technetium", mass: "(98)", cat: "transition", period: 5, group: 7, config: "[Kr] 4d5 5s2" },
  { z: 44, sym: "Ru", cn: "钌", en: "Ruthenium", mass: "101.07", cat: "transition", period: 5, group: 8, config: "[Kr] 4d7 5s1" },
  { z: 45, sym: "Rh", cn: "铑", en: "Rhodium", mass: "102.91", cat: "transition", period: 5, group: 9, config: "[Kr] 4d8 5s1" },
  { z: 46, sym: "Pd", cn: "钯", en: "Palladium", mass: "106.42", cat: "transition", period: 5, group: 10, config: "[Kr] 4d10" },
  { z: 47, sym: "Ag", cn: "银", en: "Silver", mass: "107.87", cat: "transition", period: 5, group: 11, config: "[Kr] 4d10 5s1" },
  { z: 48, sym: "Cd", cn: "镉", en: "Cadmium", mass: "112.41", cat: "transition", period: 5, group: 12, config: "[Kr] 4d10 5s2" },
  { z: 49, sym: "In", cn: "铟", en: "Indium", mass: "114.82", cat: "post", period: 5, group: 13, config: "[Kr] 4d10 5s2 5p1" },
  { z: 50, sym: "Sn", cn: "锡", en: "Tin", mass: "118.71", cat: "post", period: 5, group: 14, config: "[Kr] 4d10 5s2 5p2" },
  { z: 51, sym: "Sb", cn: "锑", en: "Antimony", mass: "121.76", cat: "metalloid", period: 5, group: 15, config: "[Kr] 4d10 5s2 5p3" },
  { z: 52, sym: "Te", cn: "碲", en: "Tellurium", mass: "127.60", cat: "metalloid", period: 5, group: 16, config: "[Kr] 4d10 5s2 5p4" },
  { z: 53, sym: "I", cn: "碘", en: "Iodine", mass: "126.90", cat: "halogen", period: 5, group: 17, config: "[Kr] 4d10 5s2 5p5" },
  { z: 54, sym: "Xe", cn: "氙", en: "Xenon", mass: "131.29", cat: "noble", period: 5, group: 18, config: "[Kr] 4d10 5s2 5p6" },
  { z: 55, sym: "Cs", cn: "铯", en: "Caesium", mass: "132.91", cat: "alkali", period: 6, group: 1, config: "[Xe] 6s1" },
  { z: 56, sym: "Ba", cn: "钡", en: "Barium", mass: "137.33", cat: "alkaline", period: 6, group: 2, config: "[Xe] 6s2" },
  { z: 57, sym: "La", cn: "镧", en: "Lanthanum", mass: "138.91", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 5d1 6s2" },
  { z: 58, sym: "Ce", cn: "铈", en: "Cerium", mass: "140.12", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f1 5d1 6s2" },
  { z: 59, sym: "Pr", cn: "镨", en: "Praseodymium", mass: "140.91", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f3 6s2" },
  { z: 60, sym: "Nd", cn: "钕", en: "Neodymium", mass: "144.24", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f4 6s2" },
  { z: 61, sym: "Pm", cn: "钷", en: "Promethium", mass: "(145)", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f5 6s2" },
  { z: 62, sym: "Sm", cn: "钐", en: "Samarium", mass: "150.36", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f6 6s2" },
  { z: 63, sym: "Eu", cn: "铕", en: "Europium", mass: "151.96", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f7 6s2" },
  { z: 64, sym: "Gd", cn: "钆", en: "Gadolinium", mass: "157.25", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f7 5d1 6s2" },
  { z: 65, sym: "Tb", cn: "铽", en: "Terbium", mass: "158.93", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f9 6s2" },
  { z: 66, sym: "Dy", cn: "镝", en: "Dysprosium", mass: "162.50", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f10 6s2" },
  { z: 67, sym: "Ho", cn: "钬", en: "Holmium", mass: "164.93", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f11 6s2" },
  { z: 68, sym: "Er", cn: "铒", en: "Erbium", mass: "167.26", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f12 6s2" },
  { z: 69, sym: "Tm", cn: "铥", en: "Thulium", mass: "168.93", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f13 6s2" },
  { z: 70, sym: "Yb", cn: "镱", en: "Ytterbium", mass: "173.05", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f14 6s2" },
  { z: 71, sym: "Lu", cn: "镥", en: "Lutetium", mass: "174.97", cat: "lanthanide", period: 6, group: 0, config: "[Xe] 4f14 5d1 6s2" },
  { z: 72, sym: "Hf", cn: "铪", en: "Hafnium", mass: "178.49", cat: "transition", period: 6, group: 4, config: "[Xe] 4f14 5d2 6s2" },
  { z: 73, sym: "Ta", cn: "钽", en: "Tantalum", mass: "180.95", cat: "transition", period: 6, group: 5, config: "[Xe] 4f14 5d3 6s2" },
  { z: 74, sym: "W", cn: "钨", en: "Tungsten", mass: "183.84", cat: "transition", period: 6, group: 6, config: "[Xe] 4f14 5d4 6s2" },
  { z: 75, sym: "Re", cn: "铼", en: "Rhenium", mass: "186.21", cat: "transition", period: 6, group: 7, config: "[Xe] 4f14 5d5 6s2" },
  { z: 76, sym: "Os", cn: "锇", en: "Osmium", mass: "190.23", cat: "transition", period: 6, group: 8, config: "[Xe] 4f14 5d6 6s2" },
  { z: 77, sym: "Ir", cn: "铱", en: "Iridium", mass: "192.22", cat: "transition", period: 6, group: 9, config: "[Xe] 4f14 5d7 6s2" },
  { z: 78, sym: "Pt", cn: "铂", en: "Platinum", mass: "195.08", cat: "transition", period: 6, group: 10, config: "[Xe] 4f14 5d9 6s1" },
  { z: 79, sym: "Au", cn: "金", en: "Gold", mass: "196.97", cat: "transition", period: 6, group: 11, config: "[Xe] 4f14 5d10 6s1" },
  { z: 80, sym: "Hg", cn: "汞", en: "Mercury", mass: "200.59", cat: "transition", period: 6, group: 12, config: "[Xe] 4f14 5d10 6s2" },
  { z: 81, sym: "Tl", cn: "铊", en: "Thallium", mass: "204.38", cat: "post", period: 6, group: 13, config: "[Xe] 4f14 5d10 6s2 6p1" },
  { z: 82, sym: "Pb", cn: "铅", en: "Lead", mass: "207.2", cat: "post", period: 6, group: 14, config: "[Xe] 4f14 5d10 6s2 6p2" },
  { z: 83, sym: "Bi", cn: "铋", en: "Bismuth", mass: "208.98", cat: "post", period: 6, group: 15, config: "[Xe] 4f14 5d10 6s2 6p3" },
  { z: 84, sym: "Po", cn: "钋", en: "Polonium", mass: "(209)", cat: "post", period: 6, group: 16, config: "[Xe] 4f14 5d10 6s2 6p4" },
  { z: 85, sym: "At", cn: "砹", en: "Astatine", mass: "(210)", cat: "halogen", period: 6, group: 17, config: "[Xe] 4f14 5d10 6s2 6p5" },
  { z: 86, sym: "Rn", cn: "氡", en: "Radon", mass: "(222)", cat: "noble", period: 6, group: 18, config: "[Xe] 4f14 5d10 6s2 6p6" },
  { z: 87, sym: "Fr", cn: "钫", en: "Francium", mass: "(223)", cat: "alkali", period: 7, group: 1, config: "[Rn] 7s1" },
  { z: 88, sym: "Ra", cn: "镭", en: "Radium", mass: "(226)", cat: "alkaline", period: 7, group: 2, config: "[Rn] 7s2" },
  { z: 89, sym: "Ac", cn: "锕", en: "Actinium", mass: "(227)", cat: "actinide", period: 7, group: 0, config: "[Rn] 6d1 7s2" },
  { z: 90, sym: "Th", cn: "钍", en: "Thorium", mass: "232.04", cat: "actinide", period: 7, group: 0, config: "[Rn] 6d2 7s2" },
  { z: 91, sym: "Pa", cn: "镤", en: "Protactinium", mass: "231.04", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f2 6d1 7s2" },
  { z: 92, sym: "U", cn: "铀", en: "Uranium", mass: "238.03", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f3 6d1 7s2" },
  { z: 93, sym: "Np", cn: "镎", en: "Neptunium", mass: "(237)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f4 6d1 7s2" },
  { z: 94, sym: "Pu", cn: "钚", en: "Plutonium", mass: "(244)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f6 7s2" },
  { z: 95, sym: "Am", cn: "镅", en: "Americium", mass: "(243)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f7 7s2" },
  { z: 96, sym: "Cm", cn: "锔", en: "Curium", mass: "(247)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f7 6d1 7s2" },
  { z: 97, sym: "Bk", cn: "锫", en: "Berkelium", mass: "(247)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f9 7s2" },
  { z: 98, sym: "Cf", cn: "锎", en: "Californium", mass: "(251)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f10 7s2" },
  { z: 99, sym: "Es", cn: "锿", en: "Einsteinium", mass: "(252)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f11 7s2" },
  { z: 100, sym: "Fm", cn: "镄", en: "Fermium", mass: "(257)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f12 7s2" },
  { z: 101, sym: "Md", cn: "钔", en: "Mendelevium", mass: "(258)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f13 7s2" },
  { z: 102, sym: "No", cn: "锘", en: "Nobelium", mass: "(259)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f14 7s2" },
  { z: 103, sym: "Lr", cn: "铹", en: "Lawrencium", mass: "(266)", cat: "actinide", period: 7, group: 0, config: "[Rn] 5f14 7s2 7p1" },
  { z: 104, sym: "Rf", cn: "𬬻", en: "Rutherfordium", mass: "(267)", cat: "transition", period: 7, group: 4, config: "[Rn] 5f14 6d2 7s2" },
  { z: 105, sym: "Db", cn: "𬭊", en: "Dubnium", mass: "(268)", cat: "transition", period: 7, group: 5, config: "[Rn] 5f14 6d3 7s2" },
  { z: 106, sym: "Sg", cn: "𬭳", en: "Seaborgium", mass: "(269)", cat: "transition", period: 7, group: 6, config: "[Rn] 5f14 6d4 7s2" },
  { z: 107, sym: "Bh", cn: "𬭛", en: "Bohrium", mass: "(270)", cat: "transition", period: 7, group: 7, config: "[Rn] 5f14 6d5 7s2" },
  { z: 108, sym: "Hs", cn: "𬭶", en: "Hassium", mass: "(269)", cat: "transition", period: 7, group: 8, config: "[Rn] 5f14 6d6 7s2" },
  { z: 109, sym: "Mt", cn: "鿏", en: "Meitnerium", mass: "(278)", cat: "transition", period: 7, group: 9, config: "[Rn] 5f14 6d7 7s2" },
  { z: 110, sym: "Ds", cn: "𫟼", en: "Darmstadtium", mass: "(281)", cat: "transition", period: 7, group: 10, config: "[Rn] 5f14 6d8 7s2" },
  { z: 111, sym: "Rg", cn: "𬬭", en: "Roentgenium", mass: "(282)", cat: "transition", period: 7, group: 11, config: "[Rn] 5f14 6d9 7s2" },
  { z: 112, sym: "Cn", cn: "鿔", en: "Copernicium", mass: "(285)", cat: "transition", period: 7, group: 12, config: "[Rn] 5f14 6d10 7s2" },
  { z: 113, sym: "Nh", cn: "鿭", en: "Nihonium", mass: "(286)", cat: "post", period: 7, group: 13, config: "[Rn] 5f14 6d10 7s2 7p1" },
  { z: 114, sym: "Fl", cn: "𫓧", en: "Flerovium", mass: "(289)", cat: "post", period: 7, group: 14, config: "[Rn] 5f14 6d10 7s2 7p2" },
  { z: 115, sym: "Mc", cn: "镆", en: "Moscovium", mass: "(290)", cat: "post", period: 7, group: 15, config: "[Rn] 5f14 6d10 7s2 7p3" },
  { z: 116, sym: "Lv", cn: "𫟹", en: "Livermorium", mass: "(293)", cat: "post", period: 7, group: 16, config: "[Rn] 5f14 6d10 7s2 7p4" },
  { z: 117, sym: "Ts", cn: "鿬", en: "Tennessine", mass: "(294)", cat: "halogen", period: 7, group: 17, config: "[Rn] 5f14 6d10 7s2 7p5" },
  { z: 118, sym: "Og", cn: "鿫", en: "Oganesson", mass: "(294)", cat: "noble", period: 7, group: 18, config: "[Rn] 5f14 6d10 7s2 7p6" },
];

/** 计算主表/附加行网格位置 */
function layout(el: Raw): { row: number; col: number } {
  if (el.cat === "lanthanide") {
    // 镧系：第 9 行，从第 3 列起（La=57 → col 3）
    return { row: 9, col: 3 + (el.z - 57) };
  }
  if (el.cat === "actinide") {
    // 锕系：第 10 行，从第 3 列起（Ac=89 → col 3）
    return { row: 10, col: 3 + (el.z - 89) };
  }
  return { row: el.period, col: el.group };
}

export const ELEMENTS: ChemElement[] = RAW.map((el) => {
  const { row, col } = layout(el);
  return { ...el, row, col };
});

/** 元素符号 → 元素 */
export const ELEMENT_BY_SYM: Record<string, ChemElement> = Object.fromEntries(
  ELEMENTS.map((e) => [e.sym, e]),
);

/** 按名称 / 符号 / 序数模糊搜索 */
export function searchElements(query: string): ChemElement[] {
  const q = query.trim().toLowerCase();
  if (!q) return ELEMENTS;
  return ELEMENTS.filter(
    (e) =>
      e.sym.toLowerCase().includes(q) ||
      e.cn.includes(q) ||
      e.en.toLowerCase().includes(q) ||
      String(e.z) === q,
  );
}
