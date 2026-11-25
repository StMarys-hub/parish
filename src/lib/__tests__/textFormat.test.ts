import { describe, expect, it } from 'vitest';
import {
  applyWrapFormat,
  cleanAnnouncementTitle,
  cleanDescriptionText,
  normalizeWhatsAppFormatting,
  parseFormattedBlocks,
  parseInlineFormattedText,
  stripFormattingMarkers,
  stripLeadingBullet,
} from '../textFormat';

describe('textFormat cleansing & inline formatting', () => {
  it('removes unwanted leading bullets, Unicode bullets, numbering, and extra spaces from titles', () => {
    expect(cleanAnnouncementTitle('  •   Sunday Qurbana   Time Change  ')).toBe(
      'Sunday Qurbana Time Change'
    );
    expect(cleanAnnouncementTitle('▪\u00A0\u200B  1.   Ward 3   Prayer Meeting:  ')).toBe(
      'Ward 3 Prayer Meeting'
    );
    expect(cleanAnnouncementTitle('➤  *Youth Choir Practice*  ')).toBe('Youth Choir Practice');
    expect(cleanAnnouncementTitle('**Special Notice:**')).toBe('Special Notice');
  });

  it('strips single bullet prefixes without breaking **bold** at start of a description line', () => {
    expect(stripLeadingBullet('•   Bring your family')).toBe('Bring your family');
    expect(stripLeadingBullet('*   Bring your family')).toBe('Bring your family');
    expect(stripLeadingBullet('**Important:** Arrive 15 minutes early')).toBe(
      '**Important:** Arrive 15 minutes early'
    );
  });

  it('cleans extra spaces in descriptions while preserving **bold** and ==highlight== markers', () => {
    expect(
      cleanDescriptionText('  Please   register by **Friday, Nov 27**  for ==free lunch== . ')
    ).toBe('Please register by **Friday, Nov 27** for ==free lunch==.');
  });

  it('parses inline bold, highlight, and combined bold+highlight into safe segments', () => {
    const segments = parseInlineFormattedText(
      'Arrive by **6:30 PM** at ==Main Church== for ==**Solemn Qurbana**==.'
    );
    expect(segments).toEqual([
      { type: 'text', value: 'Arrive by ' },
      { type: 'bold', value: '6:30 PM' },
      { type: 'text', value: ' at ' },
      { type: 'highlight', value: 'Main Church' },
      { type: 'text', value: ' for ' },
      { type: 'bold-highlight', value: 'Solemn Qurbana' },
      { type: 'text', value: '.' },
    ]);
    expect(stripFormattingMarkers('**6:30 PM** at ==Main Church==')).toBe('6:30 PM at Main Church');
  });

  it('wraps and toggles off selected text with applyWrapFormat', () => {
    const wrapped = applyWrapFormat('Please bring snacks', 7, 12, '**', 'bold text');
    expect(wrapped.nextValue).toBe('Please **bring** snacks');
    const toggledOff = applyWrapFormat(
      wrapped.nextValue,
      wrapped.nextStart,
      wrapped.nextEnd,
      '**',
      'bold text'
    );
    expect(toggledOff.nextValue).toBe('Please bring snacks');
  });

  it('normalizes WhatsApp *bold*, broken ** *bold* **, spacing glitches, and parses structured headings/lists', () => {
    expect(cleanAnnouncementTitle('Hi Kunjachan Ward families,')).toBe(
      'Hi Kunjachan Ward families'
    );
    expect(normalizeWhatsAppFormatting('** *Important Ward Updates:* **')).toBe(
      '**Important Ward Updates:**'
    );
    expect(
      normalizeWhatsAppFormatting(
        '*2. Ward Fund contribution*: please consider contributing ($50)to the ward fund.'
      )
    ).toBe('**2. Ward Fund contribution**: please consider contributing ($50) to the ward fund.');

    const blocks = parseFormattedBlocks([
      '** *Important Ward Updates:* **',
      '*1. Prayer Meeting*: No prayer meeting in November.',
      '*2. Ward Fund contribution*: Contributing ($50)to the ward fund.',
      '• Bring your family',
      '• Arrive early',
    ]);

    expect(blocks).toEqual([
      { type: 'heading', text: 'Important Ward Updates:', highlighted: false },
      {
        type: 'ordered-list',
        items: [
          { num: '1', content: '**Prayer Meeting**: No prayer meeting in November.' },
          { num: '2', content: '**Ward Fund contribution**: Contributing ($50) to the ward fund.' },
        ],
      },
      {
        type: 'bullet-list',
        items: ['Bring your family', 'Arrive early'],
      },
    ]);
  });
});
