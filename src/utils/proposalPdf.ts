import type { ProposalData } from '../sheets/proposalTypes';

function formatInr(value: number) {
  return `Rs ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatInverterType(value: string) {
  if (!value) return 'N/A';
  return value.toLowerCase().includes('inverter') ? value : `${value} Inverter`;
}

async function loadLogoDataUrl(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read logo file'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateProposalPdf(data: ProposalData): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const amber: [number, number, number] = [245, 158, 11];
  if (data.useDoctorElectricLogo !== false) {
    const logo = await loadLogoDataUrl('/image.png');
    if (logo) {
      doc.addImage(logo, 'PNG', 14, 12, 20, 20);
    }
  }

  doc.setFontSize(20);
  doc.setTextColor(30, 41, 59);
  doc.text(data.companyName, 105, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text('Solar Installation Proposal', 105, 27, { align: 'center' });
  doc.text(`${data.companyPhone} | ${data.companyEmail}`, 105, 33, { align: 'center' });

  doc.setDrawColor(...amber);
  doc.setLineWidth(1.1);
  doc.line(14, 38, 196, 38);

  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Client: ${data.clientName}`, 14, 46);
  doc.text(`Phone: ${data.clientPhone}`, 14, 51);
  doc.text(`Prepared By: ${data.preparedBy}`, 115, 46);
  doc.text(`Date: ${data.proposalDate}`, 115, 51);
  doc.text(`Address: ${data.clientAddress}`, 14, 56, { maxWidth: 180 });

  const specRows: Array<[string, string]> = [
    ['System Size', `${data.systemSizeKw} kW`],
    ['Panels', `${data.panelCount} x ${data.panelWattage} W`],
    ['Inverter', `${formatInverterType(data.inverterType)} (${data.inverterBrand || 'N/A'})`],
    ['Mounting Structure', data.mountingStructure],
    ['Roof Type', data.roofType],
    ['Battery Backup', data.batteryBackup ? `Yes${data.batteryCapacityKwh ? ` (${data.batteryCapacityKwh} kWh)` : ''}` : 'No'],
  ];
  (autoTable as any)(doc, {
    startY: 62,
    head: [['System Specifications', 'Details']],
    body: specRows,
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9.5, textColor: [51, 65, 85], cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  const financeRows: Array<[string, string]> = [
    ['System Cost', formatInr(data.systemCostBeforeSubsidy)],
    ['GST (%)', `${data.gstPercent}%`],
    ['GST Amount', formatInr(data.gstAmount)],
  ];
  if (data.subsidyEligible) {
    financeRows.push(['PM Surya Ghar Subsidy', `- ${formatInr(data.subsidyDeduction)}`]);
  }
  financeRows.push(['Final Cost to Customer', formatInr(data.finalCostToCustomer)]);
  financeRows.push(['Est. Annual Savings', formatInr(data.estimatedAnnualSavings)]);
  financeRows.push(['Payback Period', `${data.paybackPeriodYears.toFixed(1)} years`]);
  financeRows.push(['ROI', `${data.roiPercent.toFixed(1)}%`]);

  (autoTable as any)(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Financial Summary', 'Value']],
    body: financeRows,
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9.5, textColor: [51, 65, 85], cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 14, right: 14 },
    didParseCell: (hookData: any) => {
      const row = hookData.row?.raw as [string, string] | undefined;
      if (hookData.section === 'body' && row?.[0] === 'Final Cost to Customer') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  const termsY = Math.min((doc as any).lastAutoTable.finalY + 8, 262);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const terms =
    `This proposal is valid for ${data.validityDays} days from ${data.proposalDate}. ` +
    'Prices are subject to change after validity period. GST is included as applicable. ' +
    'Subsidy amounts are indicative and subject to government approval.';
  doc.text(terms, 14, termsY, { maxWidth: 182 });

  if (data.notes) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Notes: ${data.notes}`, 14, Math.min(termsY + 8, 270), { maxWidth: 182 });
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(14, 285, 196, 285);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(data.companyName, 14, 290);
  doc.text('Page 1', 196, 290, { align: 'right' });

  return doc.output('blob');
}
