export interface LayerConfig {
  key: string;
  apiKey: string;
  label: string;
  description: string;
  source: string;
  kmlName: string;
  color: string;
  colorHex: string;
  width: number;
  autoLoad: boolean;
}

export const LAYERS: LayerConfig[] = [
  {
    key: "aimags",
    apiKey: "aimags",
    label: "Аймгуудын хил",
    description: "21 аймгийн засаг захиргааны хил хязгаар",
    source: "geoBoundaries.org",
    kmlName: "Аймгууд",
    color: "ff0000ff",
    colorHex: "#ff0000",
    width: 3,
    autoLoad: true,
  },
  {
    key: "soums",
    apiKey: "soums",
    label: "Сумдын хил",
    description: "330+ сумын засаг захиргааны хил хязгаар",
    source: "geoBoundaries.org",
    kmlName: "Сумд",
    color: "ffff8800",
    colorHex: "#0088ff",
    width: 1,
    autoLoad: true,
  },
  {
    key: "spa",
    apiKey: "spa",
    label: "Тусгай хамгаалалттай газар нутаг",
    description: "Байгалийн цогцолборт газар, дархан цаазат газар, дурсгалт газар",
    source: "egazar.gov.mn",
    kmlName: "Тусгай хамгаалалттай газар",
    color: "ff00cc00",
    colorHex: "#00cc00",
    width: 3,
    autoLoad: false,
  },
  {
    key: "protection_zones",
    apiKey: "protection_zones",
    label: "Хамгаалалтын бүс, зурвас газар",
    description: "Ус, ой, дэд бүтцийн хамгаалалтын бүс (5,700+ бүс)",
    source: "egazar.gov.mn",
    kmlName: "Хамгаалалтын бүс",
    color: "ffcc00cc",
    colorHex: "#cc00cc",
    width: 2,
    autoLoad: false,
  },
  {
    key: "land_parcels",
    apiKey: "land_parcels",
    label: "Газар эзэмшлийн зөвшөөрөл",
    description: "Газар эзэмших, ашиглах эрхийн нэгж талбарууд (10,000 хүртэл)",
    source: "egazar.gov.mn",
    kmlName: "Газар эзэмшил",
    color: "ff00ddff",
    colorHex: "#ffdd00",
    width: 1,
    autoLoad: false,
  },
  {
    key: "mining",
    apiKey: "mining_conservation",
    label: "Уул уурхайн хамгаалалтын бүс",
    description: "Уул уурхайн нөхөн сэргээлтийн болон хамгаалалтын талбай",
    source: "egazar.gov.mn",
    kmlName: "Уул уурхайн хамгаалалт",
    color: "ff0088ff",
    colorHex: "#ff8800",
    width: 2,
    autoLoad: false,
  },
  {
    key: "cmcs_licenses",
    apiKey: "cmcs_licenses",
    label: "Уул уурхайн тусгай зөвшөөрөл (CMCS)",
    description: "Хайгуулын болон ашиглалтын тусгай зөвшөөрлүүд (2,800+)",
    source: "cmcs.mrpam.gov.mn",
    kmlName: "Уул уурхайн ТЗ",
    color: "ff3366ff",
    colorHex: "#ff6633",
    width: 2,
    autoLoad: false,
  },
];

export type GeoJSONFeature = {
  type: string;
  properties: Record<string, string>;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

export type GeoJSONData = {
  type: string;
  features: GeoJSONFeature[];
};
