export type Role = 'Admin' | 'Sales Team' | 'Engineer' | 'Accountant' | 'Manager';
export type WorkflowStage = 'Lead' | '1. REGISTRATION' | '2. LOAN APPLIED' | '3. LOAN APPROVED' | '4. FIRST DISBURSAL' | '5. MARGIN MONEY' | '6. STRUCTURE INSTALLATION' | '7. WIRING DONE' | '8. NET METERING' | '9. PORTAL UPDATE' | '10. SUBSIDY CLAIM' | '11. 30% FILE SENT TO BANK' | '12. 30% RECEIVED' | '13. FILE / CASE CLOSED';
export type SubsidyStatus = 'Applied' | 'Under Review' | 'Approved' | 'Received';

export interface UserRow {
  Email: string;
  Role: Role;
  Name: string;
  Active: string; // "TRUE" or "FALSE"
}

export interface ClientRow {
  'ID': string;
  'Name': string;
  'Phone': string;
  'Address': string;
  'Roof Type': string;
  'Battery Type': string;
  'System Size (kW)': string;
  'Created Date': string;
  'Assigned To': string;
  'Assigned To Field': string;
  'Payment Mode': string;
  'Dispute Status': string;
}

export interface WorkflowStatusRow {
  'Client ID': string;
  'Stage': WorkflowStage;
  'Updated At': string;
  'Updated By': string;
}

export interface SurveyRow {
  'Client ID': string;
  'Survey Date': string;
  'Site Images': string;
  'Recommended System Details': string;
  'Surveyor Name': string;
}

export interface QuotationRow {
  'Client ID': string;
  'Quotation PDF': string;
  'Amount (₹)': string;
  'Validity Date': string;
  'Approval Status': string;
}

export interface InstallationRow {
  'Client ID': string;
  'Team Members': string;
  'Progress Notes': string;
  'Completion %': string;
  'Start Date': string;
  'End Date': string;
}

export interface SubsidyRow {
  'Client ID': string;
  'Status': SubsidyStatus;
  'Applied Date': string;
  'Approval Date': string;
  'Amount (₹)': string;
}

export interface PaymentRow {
  'Client ID': string;
  'Total Amount (₹)': string;
  'Paid Amount (₹)': string;
  'Pending Amount (₹)': string;
  'Due Date': string;
  'Payment Status': string;
}

export interface DocumentRow {
  'Client ID': string;
  'Aadhaar Link': string;
  'Aadhaar Number': string;
  'Electricity Bill Link': string;
  'Bill Number': string;
  'PAN Card Link': string;
  'Bank Details': string;
  'Additional Doc 1 Link': string;
  'Additional Doc 2 Link': string;
  'Additional Doc 3 Link': string;
  'Quotation Doc Link': string;
  'Installation Photos Link': string;
  'Subsidy Docs Link': string;
}
