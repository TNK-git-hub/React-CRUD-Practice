// Fake Myinfo data for the Singpass staging test personas (brief §6). No real data, no passwords.

export interface MyinfoPerson {
  uinfin: string;
  name: string;
  aliasName: string;
  sex: string;
  race: string;
  nationality: string;
  dob: string;
  birthCountry: string;
  maritalStatus: string;
  email: string;
  mobile: string;
  regAddress: string;
  employer: string;
  employmentSector: string;
  occupation: string;
  education: string;
  noaHistory: { year: number; amount: number }[];
  cpfMonths: number;
  cpfLatestAmount: number;
  housingType: string;
  hdbType: string;
  hdbOwnership: string;
  hdbPurchaseDate: string;
  hdbMonthlyInstalment: number;
  hdbOutstandingLoan: number;
}

type Seed = Pick<MyinfoPerson, "uinfin" | "name" | "sex" | "race" | "nationality" | "dob" | "birthCountry" | "regAddress" | "employer" | "occupation"> &
  Partial<MyinfoPerson> & { income: number };

function make(s: Seed): MyinfoPerson {
  const first = s.name.split(" ")[0]?.toLowerCase() ?? "myinfo";
  return {
    aliasName: "",
    maritalStatus: "SINGLE",
    email: `${first}.myinfotesting@example.com`,
    mobile: "+65 97399245",
    employmentSector: "PRIVATE SECTOR",
    education: "DEGREE",
    noaHistory: [
      { year: 2025, amount: s.income },
      { year: 2024, amount: Math.round(s.income * 0.94) },
    ],
    cpfMonths: 15,
    cpfLatestAmount: Math.round((s.income / 12) * 0.37),
    housingType: "HDB",
    hdbType: "4-ROOM FLAT (HDB)",
    hdbOwnership: "1 OWNER",
    hdbPurchaseDate: "2019-06-14",
    hdbMonthlyInstalment: 1150,
    hdbOutstandingLoan: 212000,
    ...s,
  };
}

export const PERSONAS: MyinfoPerson[] = [
  make({ uinfin: "F4440488P", name: "HENG SHI ZHENG", sex: "MALE", race: "CHINESE", nationality: "CHINESE", dob: "2000-02-02", birthCountry: "CHINA", regAddress: "123 TOA PAYOH VIEW, #18-220 LORONG 1 TOA PAYOH, Singapore 310123", employer: "TECHWORKS PTE LTD", occupation: "SOFTWARE ENGINEER", income: 84000 }),
  make({ uinfin: "F4440489M", name: "WANG XIAO LING", sex: "FEMALE", race: "CHINESE", nationality: "CHINESE", dob: "1994-07-19", birthCountry: "CHINA", regAddress: "Blk 456 Ang Mo Kio Ave 10, #07-1123, Singapore 560456", employer: "HARBOUR LOGISTICS PTE LTD", occupation: "ACCOUNTANT", income: 72000, maritalStatus: "MARRIED" }),
  make({ uinfin: "G4440425M", name: "RAJESH KUMAR S/O MURUGAN", sex: "MALE", race: "INDIAN", nationality: "INDIAN", dob: "1987-11-03", birthCountry: "INDIA", regAddress: "Blk 210 Jurong East St 21, #11-301, Singapore 600210", employer: "PRECISION ENGINEERING PTE LTD", occupation: "PROJECT MANAGER", income: 96000, maritalStatus: "MARRIED" }),
  make({ uinfin: "G4440427W", name: "MARIA SANTOS REYES", sex: "FEMALE", race: "FILIPINO", nationality: "FILIPINO", dob: "1991-04-25", birthCountry: "PHILIPPINES", regAddress: "21 Tampines Central 1, #09-14, Singapore 529541", employer: "CITYCARE MEDICAL PTE LTD", occupation: "NURSE", income: 54000, housingType: "PRIVATE CONDOMINIUM", hdbType: "", hdbOwnership: "", hdbPurchaseDate: "", hdbMonthlyInstalment: 0, hdbOutstandingLoan: 0 }),
  make({ uinfin: "G4440430W", name: "NGUYEN VAN AN", sex: "MALE", race: "VIETNAMESE", nationality: "VIETNAMESE", dob: "1996-09-09", birthCountry: "VIETNAM", regAddress: "Blk 88 Bedok North Ave 4, #03-1501, Singapore 460088", employer: "MARINA BAY HOTELS PTE LTD", occupation: "CHEF", income: 48000 }),
  make({ uinfin: "G4440431T", name: "KIM MIN JUN", sex: "MALE", race: "KOREAN", nationality: "KOREAN", dob: "1989-01-30", birthCountry: "KOREA, SOUTH", regAddress: "8 Holland Grove Road, #04-02, Singapore 278790", employer: "ASIA FINTECH LABS PTE LTD", occupation: "PRODUCT DIRECTOR", income: 156000, housingType: "PRIVATE CONDOMINIUM", hdbType: "", hdbOwnership: "", hdbPurchaseDate: "", hdbMonthlyInstalment: 0, hdbOutstandingLoan: 0 }),
  make({ uinfin: "G4440432Q", name: "AISHA BINTE RAHMAN", sex: "FEMALE", race: "MALAY", nationality: "MALAYSIAN", dob: "1998-12-12", birthCountry: "MALAYSIA", regAddress: "Blk 301 Woodlands St 31, #06-88, Singapore 730301", employer: "NORTHPOINT RETAIL PTE LTD", occupation: "STORE MANAGER", income: 45000 }),
  make({ uinfin: "G4440433N", name: "DAVID TAN JUN HAO", sex: "MALE", race: "CHINESE", nationality: "MALAYSIAN", dob: "1985-05-05", birthCountry: "MALAYSIA", regAddress: "Blk 17 Sengkang East Way, #12-410, Singapore 540017", employer: "SG BUILDERS PTE LTD", occupation: "SITE ENGINEER", income: 78000, maritalStatus: "MARRIED" }),
  make({ uinfin: "M5004553J", name: "OLIVIA CHEN YU TING", sex: "FEMALE", race: "CHINESE", nationality: "TAIWANESE", dob: "2001-08-14", birthCountry: "TAIWAN", regAddress: "Blk 512 Clementi Ave 1, #10-25, Singapore 120512", employer: "LIONCITY DESIGN STUDIO PTE LTD", occupation: "UX DESIGNER", income: 60000 }),
];

export function findPersona(uinfin: string): MyinfoPerson | undefined {
  return PERSONAS.find((p) => p.uinfin === uinfin.trim().toUpperCase());
}

// A valid NRIC that is not a listed persona still logs in, with generic test data.
export function personaFor(uinfin: string): MyinfoPerson {
  const v = uinfin.trim().toUpperCase();
  return (
    findPersona(v) ??
    make({ uinfin: v, name: "MYINFO TEST PERSON", sex: "MALE", race: "CHINESE", nationality: "SINGAPORE CITIZEN", dob: "1990-01-01", birthCountry: "SINGAPORE", regAddress: "Blk 123 Tampines St 11, #05-21, Singapore 521123", employer: "DEMO EMPLOYER PTE LTD", occupation: "EXECUTIVE", income: 84000 })
  );
}
