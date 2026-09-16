// Region X (Northern Mindanao) location helper. Cities/municipalities are
// supplied as suggestions only: users may still type a location not in this list.
export const REGION_X_CITIES: Record<string, string[]> = {
  Bukidnon: ["Baungon", "Cabanglasan", "Damulog", "Dangcagan", "Don Carlos", "Impasugong", "Kadingilan", "Kalilangan", "Kibawe", "Kitaotao", "Lantapan", "Libona", "Malaybalay City", "Malitbog", "Manolo Fortich", "Maramag", "Pangantucan", "Quezon", "San Fernando", "Sumilao", "Talakag", "Valencia City"],
  Camiguin: ["Catarman", "Guinsiliban", "Mahinog", "Mambajao", "Sagay"],
  "Lanao del Norte": ["Bacolod", "Baloi", "Baroy", "Iligan City", "Kapatagan", "Kauswagan", "Kolambugan", "Lala", "Linamon", "Magsaysay", "Maigo", "Matungao", "Munai", "Nunungan", "Pantao Ragat", "Poona Piagapo", "Salvador", "Sapad", "Sultan Naga Dimaporo", "Tagoloan", "Tangcal", "Tubod"],
  "Misamis Occidental": ["Aloran", "Baliangao", "Bonifacio", "Calamba", "Clarin", "Concepcion", "Don Victoriano Chiongbian", "Jimenez", "Lopez Jaena", "Oroquieta City", "Ozamiz City", "Panaon", "Plaridel", "Sapang Dalaga", "Sinacaban", "Tangub City", "Tudela"],
  "Misamis Oriental": ["Alubijid", "Balingasag", "Balingoan", "Binuangan", "Cagayan de Oro City", "Claveria", "El Salvador City", "Gingoog City", "Gitagum", "Initao", "Jasaan", "Kinoguitan", "Lagonglong", "Laguindingan", "Libertad", "Lugait", "Magsaysay", "Manticao", "Medina", "Naawan", "Opol", "Salay", "Sugbongcogon", "Tagoloan", "Talisayan", "Villanueva"],
};

export const REGION_X_PROVINCES = Object.keys(REGION_X_CITIES);

// A short set of common suggestions for major Region X cities. Barangays remain
// free-text because every municipality has its own full barangay directory.
export const REGION_X_BARANGAYS: Record<string, string[]> = {
  "Cagayan de Oro City": ["Balulang", "Bugo", "Bulua", "Carmen", "Gusa", "Iponan", "Kauswagan", "Lapasan", "Lumbia", "Macabalan", "Macasandig", "Nazareth", "Pagatpat", "Puerto", "Puntod", "Tablon"],
  "Iligan City": ["Hinaplanon", "Pala-o", "Santiago", "Suarez", "Tambacan", "Tibanga"],
  "Malaybalay City": ["Casisang", "Dalwangan", "Impalambong", "Kalasungay", "Linabo", "Sumpong"],
  "Valencia City": ["Bagontaas", "Barobo", "Batangan", "Catumbalon", "Lurugan", "Poblacion"],
  "Ozamiz City": ["Aguada", "Banadero", "Baybay Santa Cruz", "Carmen", "Cotta", "Maningcol", "Tinago"],
};
