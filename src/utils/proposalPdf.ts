import { ProposalData } from '../sheets/proposalTypes';

function formatInrOnly(value: number): string {
  return Math.round(value).toString();
}

async function loadLogoDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to load image:', url, error);
    return null;
  }
}

function drawHighlightedText(doc: any, text: string, x: number, y: number, fontSize: number, isBold = false) {
  doc.setFont('helvetica', isBold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  const w = doc.getTextWidth(text);
  const h = fontSize * 0.35; // height offset
  doc.setFillColor(255, 255, 180);
  doc.rect(x - 1, y - h - 0.5, w + 2, h + 1.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.text(text, x, y);
}

async function drawPageDecorations(doc: any, logo: string | null, data: ProposalData) {
  // 1. Header logo
  if (logo && data.useDoctorElectricLogo !== false) {
    doc.addImage(logo, 'PNG', 14, 12, 20, 20);
  }

  // 2. Header Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 51, 153); // Blue
  doc.text('DOCTOR ELECTRIC', 105, 18, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(204, 0, 0); // Red
  doc.text('Mal-Godam Road Cantt Varanasi Uttar Pradesh -221002', 105, 23, { align: 'center' });
  doc.text('Mob: +91-8329114497, +91-7411046519 Email:', 105, 27, { align: 'center' });

  doc.setTextColor(0, 51, 153); // Blue
  const emailStr = 'hod.doctorelectric@gmail.com';
  const restText = 'Solar*Transformer*Voltage stabilizer*UPS';
  const emailWidth = doc.getTextWidth(emailStr);
  const restWidth = doc.getTextWidth(restText);
  const totalW = emailWidth + restWidth + 2;

  const emailStart = 105 - totalW / 2;
  doc.text(emailStr, emailStart + emailWidth / 2, 31, { align: 'center' });
  
  // Underline for email
  doc.setDrawColor(0, 51, 153);
  doc.setLineWidth(0.2);
  doc.line(emailStart, 31.5, emailStart + emailWidth, 31.5);

  doc.setTextColor(0, 0, 0); // Black
  doc.text(restText, emailStart + emailWidth + 1 + restWidth / 2, 31, { align: 'center' });

  // 3. Watermark background
  if (logo && data.useDoctorElectricLogo !== false) {
    try {
      const gState = new (doc as any).GState({ opacity: 0.05 });
      doc.saveGraphicsState();
      doc.setGState(gState);
      doc.addImage(logo, 'PNG', 45, 85, 120, 120);
      doc.restoreGraphicsState();
    } catch {
      // Fallback if GState not supported
    }
  }
}

export async function generateProposalPdf(data: ProposalData): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl('/image.png');
  const stamp = await loadLogoDataUrl('/stamp.png');

  // ==================== PAGE 1 ====================
  await drawPageDecorations(doc, logo, data);

  // Title: Offer for Solar Power plant 2 Kva Hybrid
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  const titleText = `Offer for Solar Power plant  ${data.systemSizeKw} Kva ${data.inverterType}`;
  const titleWidth = doc.getTextWidth(titleText);
  doc.text(titleText, 105, 45, { align: 'center' });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(105 - titleWidth / 2, 46.5, 105 + titleWidth / 2, 46.5);

  // Kind Attn & Client Details
  let clientY = 54;
  drawHighlightedText(doc, 'Kind Attn:', 14, clientY, 9, true);

  clientY += 6;
  drawHighlightedText(doc, data.clientName || 'UP', 14, clientY, 9, true);

  if (data.clientAddress) {
    const addrLines = doc.splitTextToSize(data.clientAddress, 100);
    for (const line of addrLines) {
      clientY += 6;
      drawHighlightedText(doc, line, 14, clientY, 9, false);
    }
  }

  // Date on the right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const displayDate = data.proposalDate ? data.proposalDate.split('-')[0] : '2026';
  const dateString = `Date :${displayDate}`;
  doc.text(dateString, 196 - doc.getTextWidth(dateString), 60);

  // Notice Title & Paragraphs
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Confidentiality & General Conditions Notice', 14, 84);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  const p1 = 'This commercial proposal for installation of solar rooftop power system (the "Proposal") is submitted with the intent of executing a definitive and legally binding agreement (the "Agreement") following an award of business to DOCTOR Electric. The Proposal itself is a legally binding offer to contract and in the event of an award to DOCTOR Electric, it shall execute an Agreement that will be the complete agreement between the parties, however, where the parties do not execute any such Agreement, then the terms and conditions mentioned in this Proposal shall govern any purchase order(s) issued by the Customer in reference to the installation of rooftop solar power system.';
  const p2 = 'This Proposal constitutes confidential and proprietary information of and requires that Customer treat the information contained in this Proposal as confidential. Customer may use the information contained in this Proposal solely for the purposes of evaluating this Proposal and executing the Agreement with DOCTOR Electric. This Proposal and all supporting documentation and manuals provided to Customer in connection with this Proposal shall remain the property of DOCTOR Electric. And must be returned immediately upon request.';
  const p3 = 'This Proposal is based upon the set of requirements provided by Customer to DOCTOR Electric, and certain reasonable assumptions taken by DOCTOR Electric. And that maybe set forth by Owner. If Customer alters the requirements or if any assumption stated herein are false or inaccurate, then this Proposal, including pricing, may change. Implementation of any services detailed in this Proposal is subject to applicable legal and regulatory norms and requirements in force as on the date when services are to be implemented and such implementation may vary to cater to the requirements of such applicable legal and regulatory norms and requirements.';

  let noticeY = 88;
  const lines1 = doc.splitTextToSize(p1, 182);
  doc.text(lines1, 14, noticeY);
  noticeY += lines1.length * 3.5 + 3;

  const lines2 = doc.splitTextToSize(p2, 182);
  doc.text(lines2, 14, noticeY);
  noticeY += lines2.length * 3.5 + 3;

  const lines3 = doc.splitTextToSize(p3, 182);
  doc.text(lines3, 14, noticeY);
  noticeY += lines3.length * 3.5 + 5;

  // Introduction
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Introduction', 14, noticeY);
  doc.line(14, noticeY + 1, 33, noticeY + 1);
  noticeY += 5;

  // Page 1 Specs Table (Row 1 Only)
  const row1Features = [
    '25 years power output warranty',
    '>16.25% high efficiency modules',
    'Certified for Corrosion Resistance',
    'Aluminum Frame',
    'Certified for withstanding challenging wind loads',
    'RFID Tag on each module for obtaining details',
    'Technical Datasheet of Modules Enclosed'
  ].join('\n');

  (autoTable as any)(doc, {
    startY: noticeY,
    head: [['S.No\n.', 'Item', 'Qty.', 'Unit', 'Make', 'Features']],
    body: [
      [
        '1.',
        'Solar PV Modules\n\nMono half cut\nBifacial panel',
        `${data.panelCount} pc ( ${data.panelWattage} Watt )`,
        '',
        'Waaree\nLuminous\nAdani',
        row1Features
      ]
    ],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      valign: 'middle',
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 12 },
      4: { cellWidth: 25 },
      5: { cellWidth: 60 }
    },
    margin: { left: 14, right: 14 },
    willDrawCell: (hookData: any) => {
      const { cell, column, row, section } = hookData;
      if (section === 'body') {
        const colIdx = column.index;
        if (colIdx === 1) {
          // Bottom half highlight for Item cell
          doc.setFillColor(255, 255, 180);
          doc.rect(cell.x, cell.y + cell.height * 0.45, cell.width, cell.height * 0.55, 'F');
        } else if (colIdx === 2 || colIdx === 4) {
          // Full highlight for Qty & Make
          doc.setFillColor(255, 255, 180);
          doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
          cell.styles.fontStyle = 'bold';
        } else if (colIdx === 5) {
          // Top line highlight for Features
          doc.setFillColor(255, 255, 180);
          doc.rect(cell.x, cell.y, cell.width, cell.height * 0.18, 'F');
        }
      }
    }
  });

  // Branch Office Footer on Page 1 only
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Branch Office: shop no 05 Lalchan compound Ulhasnagar thane Maharashtra 421005', 105, 285, { align: 'center' });

  // ==================== PAGE 2 ====================
  doc.addPage();
  await drawPageDecorations(doc, logo, data);

  const page2Rows = [
    [
      '2.',
      'Solar Module Mounting\nStructure',
      'As per final\ndesign',
      'Set *',
      'Design',
      'G I STRUCTURE FULL SET\n\nStrengthened for Wind load resistance\nFixed mounting\nTilt 24 to 30 design as per final design'
    ],
    [
      '3.',
      `${data.systemSizeKw} Kva ${data.inverterType}\ninverter`,
      '1 pc',
      'No.',
      data.inverterBrand || 'Sundek / Servotech',
      'provide maximum power output\n230 V AC, Single Phase, String Type\n( 5 yrs warranty )'
    ]
  ];

  if (data.batteryBackup) {
    page2Rows.push([
      '4.',
      'Battery',
      '1 pc.',
      '',
      'Luminous',
      '150 ah warranty 60 moths'
    ]);
  }

  const baseIdx = data.batteryBackup ? 5 : 4;

  page2Rows.push(
    [
      String(baseIdx),
      'A.C Distribution Box\nDCDB',
      '1 pc\n1 pc',
      'No.',
      '',
      'Wiring : polycab , RR cable,\nDC SPD\'s : Phoenix\nWall Mounting'
    ],
    [
      String(baseIdx + 1),
      'DC Solar Wire',
      '1',
      'Set',
      'Polycab\nMicrotek',
      'AS FOR REQUIRED'
    ],
    [
      String(baseIdx + 2),
      'Earthing Kit along\nwithaccessories',
      '3 pc',
      'Set',
      'HYGRID',
      '17.2 mm Copper coading GI ROD\nMaintenance free chemical earthing\nBack filling compound - 25kg per beg'
    ],
    [
      String(baseIdx + 3),
      'Lightning Arrestor',
      '1 pc',
      'Set',
      'JEYTEE/JMV',
      'CONVENTIONAL Lightning Arrestor'
    ],
    [
      String(baseIdx + 4),
      'Net Metering',
      '1 pc',
      '',
      '',
      `${data.systemSizeKw} kw SINGLE Phase`
    ],
    [
      String(baseIdx + 5),
      'Earthing wire',
      '1',
      'Set',
      'JEYTEE/JMV',
      'G.I Earthing Wire'
    ],
    [
      String(baseIdx + 6),
      'Others',
      '1',
      'Set',
      'Asper\nStandar/\nMNRE\nApproved',
      'Conduit Pipe\nFlexible Pipe\nRing Type\nLugs\nMC4 connectors\nCable Tie\nUser\nManual\nTraining for\nStaffEtc.'
    ]
  );

  (autoTable as any)(doc, {
    startY: 42,
    head: [['S.No\n.', 'Item', 'Qty.', 'Unit', 'Make', 'Features']],
    body: page2Rows,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      valign: 'middle',
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 12 },
      4: { cellWidth: 25 },
      5: { cellWidth: 60 }
    },
    margin: { left: 14, right: 14 },
    willDrawCell: (hookData: any) => {
      const { cell, column, row, section } = hookData;
      if (section === 'body') {
        const col = column.index;
        const itemText = String(row.cells[1]?.raw || '');
        
        let highlight = false;
        let partialHighlight = false;
        let partialType: 'top' | 'bottom' | '' = '';
        let partialRatio = 1.0;

        if (itemText.includes('Mounting')) {
          if (col === 1 || col === 3) {
            highlight = true;
          } else if (col === 5) {
            partialHighlight = true;
            partialType = 'top';
            partialRatio = 0.22;
          }
        } else if (itemText.includes('inverter') || itemText.includes('Inverter')) {
          if (col === 1 || col === 2 || col === 3 || col === 4) {
            highlight = true;
          } else if (col === 5) {
            partialHighlight = true;
            partialType = 'bottom';
            partialRatio = 0.35;
          }
        } else if (itemText.includes('Battery')) {
          if (col === 0 || col === 1 || col === 2 || col === 4 || col === 5) {
            highlight = true;
          }
        } else if (itemText.includes('Distribution') || itemText.includes('DCDB')) {
          if (col === 2) {
            highlight = true;
          }
        } else if (itemText.includes('DC Solar Wire')) {
          if (col === 4 || col === 5) {
            highlight = true;
          }
        } else if (itemText.includes('Earthing Kit')) {
          if (col === 1 || col === 2) {
            highlight = true;
          }
        } else if (itemText.includes('Lightning')) {
          if (col === 1 || col === 2) {
            highlight = true;
          }
        } else if (itemText.includes('Net Metering')) {
          if (col === 1 || col === 2 || col === 5) {
            highlight = true;
          }
        }

        if (highlight) {
          doc.setFillColor(255, 255, 180);
          doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
          cell.styles.fontStyle = 'bold';
        } else if (partialHighlight) {
          doc.setFillColor(255, 255, 180);
          if (partialType === 'top') {
            doc.rect(cell.x, cell.y, cell.width, cell.height * partialRatio, 'F');
          } else if (partialType === 'bottom') {
            doc.rect(cell.x, cell.y + cell.height * (1 - partialRatio), cell.width, cell.height * partialRatio, 'F');
          }
        }
      }
    }
  });

  let noteY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Note:-', 14, noteY);
  noteY += 4;
  doc.setFont('helvetica', 'normal');
  const noteText = `Please note quantity mentioned will vary with module capacity and string sizing during detail engineering, however, apt quantity to meet ${data.systemSizeKw} kva requirement will be provided by DOCTOR Electric.`;
  const noteLines = doc.splitTextToSize(noteText, 182);
  doc.text(noteLines, 14, noteY);
  noteY += noteLines.length * 4.5 + 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Commercial Offer:', 14, noteY);
  noteY += 4;
  doc.setFont('helvetica', 'normal');
  const commText = `Price for Design, Supply, Installation, Testing and CommissioningPrice offer for design, engineering, supply, transportation, installation, testing & commissioning of the ${data.systemSizeKw} Kva Solar PV Plant as per bill of material enclosed above:`;
  const commLines = doc.splitTextToSize(commText, 182);
  doc.text(commLines, 14, noteY);

  // ==================== PAGE 3 ====================
  doc.addPage();
  await drawPageDecorations(doc, logo, data);

  // Title: 2 kva Hybrid Solar System price
  const priceTitle = `${data.systemSizeKw} kva ${data.inverterType} Solar System price`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  
  const titleW = doc.getTextWidth(priceTitle);
  doc.setFillColor(255, 255, 180);
  doc.rect(105 - titleW / 2 - 2, 41, titleW + 4, 7, 'F');
  doc.text(priceTitle, 105, 46.5, { align: 'center' });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(105 - titleW / 2, 48, 105 + titleW / 2, 48);

  // Price Table
  (autoTable as any)(doc, {
    startY: 52,
    head: [['S.No\n.', 'Purchase order for', 'Order Value (In Rs.)', 'Taxes Extra']],
    body: [
      [
        '1.',
        `Supply of material for ${data.systemSizeKw} kva Solar Rooftop\nPower Plant`,
        `${formatInrOnly(data.systemCostBeforeSubsidy)} /-`,
        `${formatInrOnly(data.gstAmount)}/- @ ${data.gstPercent} %`
      ],
      [
        { content: 'Net Price Inclusive Taxes', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: `Rs. ${formatInrOnly(data.finalCostToCustomer)} /-`, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 180] } }
      ]
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      valign: 'middle',
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { cellWidth: 45 },
      3: { cellWidth: 42 }
    },
    margin: { left: 14, right: 14 }
  });

  let page3Y = (doc as any).lastAutoTable.finalY + 6;

  // NOTE :- CIVIL WORK IN NOT INCLUDED THIS OFFER.
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);

  const line1 = 'NOTE :-';
  const line2 = 'CIVIL WORK IN NOT INCLUDED THIS OFFER.';
  const line1W = doc.getTextWidth(line1);
  const line2W = doc.getTextWidth(line2);

  // NOTE :- left-aligned at x=14
  doc.setFillColor(255, 255, 180);
  doc.rect(14, page3Y, line1W + 4, 6, 'F');
  doc.text(line1, 16, page3Y + 4.5);

  // CIVIL WORK... centered on the same line
  doc.setFillColor(255, 255, 180);
  doc.rect(105 - line2W / 2 - 4, page3Y, line2W + 8, 6, 'F');
  doc.text(line2, 105, page3Y + 4.5, { align: 'center' });

  page3Y += 12;

  // Bank details card
  const bankRows = [
    ['Vendor :-', 'DOCTOR ELECTRIC'],
    ['GST NO:-', '-09AWSPR0465L1ZP'],
    ['BANK NAME:-', 'BANK OF BARODA'],
    ['A/C NO :-', '57120500000255'],
    ['BRANCH :-', 'ANDHRA PUL, CANTT, VARANASI'],
    ['IFSC CODE :-', '-BARB0CANTTX']
  ];

  (autoTable as any)(doc, {
    startY: page3Y,
    body: bankRows,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fillColor: [255, 255, 180]
    },
    columnStyles: {
      0: { cellWidth: 40, halign: 'left' },
      1: { cellWidth: 90, halign: 'left' }
    },
    margin: { left: 40 }
  });

  page3Y = (doc as any).lastAutoTable.finalY + 8;

  // Terms & Conditions Title
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('General Terms & Conditions:', 14, page3Y);
  page3Y += 4.5;

  // Price Term
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const term1 = 'Price: The price quoted in this proposal is inclusive of design, manufacturing, sourcing, testing, supply, installation & commissioning as per bill of material submitted by DOCTOR Electric. Any changes in scope of work or addition to the bill of material and/or rating or any variation, whatsoever, shall be charged extra to customer. The prices quoted are CIF site and is firm. The price is exclusive of any annual maintenance charges or operation & maintenance charges.';
  const term1Lines = doc.splitTextToSize(term1, 182);
  doc.text(term1Lines, 14, page3Y);
  page3Y += term1Lines.length * 3.5 + 3;

  // Validity Term
  const valDays = data.validityDays === 7 ? '07' : data.validityDays.toString();
  const term2 = `Validity of Offer: The price quoted by DOCTOR Electric along with this Proposal is valid for thirty (${valDays}) days from such communication to the customer and thereafter the same shall be subject to reconfirmation by DOCTOR Electric.`;
  const term2Lines = doc.splitTextToSize(term2, 182);
  doc.text(term2Lines, 14, page3Y);
  page3Y += term2Lines.length * 3.5 + 4;

  // Custom/Standard Terms Textarea content
  if (data.customTerms) {
    const customTermsLines = doc.splitTextToSize(data.customTerms, 182);
    doc.text(customTermsLines, 14, page3Y);
    page3Y += customTermsLines.length * 3.5 + 6;
  } else {
    page3Y += 4;
  }

  // Sign-off section
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Thanks with regards', 14, page3Y);
  doc.text('Rukumkesh Rai', 14, page3Y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text('8329114497//7411046519', 14, page3Y + 9);
  doc.text('Hod.doctorelectric@gmail.com', 14, page3Y + 13.5);

  // Right Stamp (Cropped transparent blue seal with signature, centered at bottom-right)
  if (stamp && data.useDoctorElectricLogo !== false) {
    doc.addImage(stamp, 'PNG', 150, page3Y - 5, 28, 28);
  }

  return doc.output('blob');
}

