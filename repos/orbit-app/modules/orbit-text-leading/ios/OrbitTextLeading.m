// iOS, Japanese UI: puts every line of a fixed-lineHeight paragraph on the baseline Chrome (the
// design) gives it, whether or not the line holds Latin letters / digits in SF.
//
// UiText sets kana / kanji in Hiragino Sans and leaves Latin letters and digits in SF (R05 choice
// (b)). RN writes `lineHeight` as NSParagraphStyle minimum = maximum line height; TextKit keeps the
// line box at that height but puts each line's baseline at lineHeight − the line's largest
// descender. SF's descender is larger than Hiragino's (16.5px: 3.98 vs 1.98; 12px: 2.89 vs 1.44),
// so a line holding any SF glyph sits 1.4–2pt higher than an all-Hiragino line of the same
// paragraph and the text rows read 2–3pt apart (16.5px / lh 24.75 measured 27 against the
// design's 24; 12px / lh 18.6 measured 20 against 18). The kit's font stack starts with
// -apple-system, so in CSS every line sits (to within a pixel: Blink rounds metrics, and the
// Hiragino run's own half-leading can lower a line by ~0.3px) on the SF strut's baseline:
// half-leading + SF ascender, i.e. (lineHeight − (ascender + descender)) / 2 + ascender.
//
// RN creates its NSLayoutManager in RCTTextLayoutManager (Fabric; RCTTextShadowView on the old
// architecture does the same) and sets usesFontLeading = NO right after creating it; that call is
// the hook used here to attach a line-fragment delegate. TextInput lays out in its own UITextView
// and is not adjusted. The delegate
// sets a line's baseline to the CSS position (plus RN's own NSBaselineOffset, which the drawing
// subtracts again) only when: (1) the paragraph has a fixed lineHeight (minimum == maximum) and
// TextKit kept the line at that height; (2) the text holds Hiragino Sans at the line's size, i.e.
// Japanese UI; (3) the line holds no attachment and only the system font (SF) and Hiragino Sans,
// all at one size; (4) the glyphs fit the line box (lineHeight ≥ SF ascender + descender), so
// centring never pushes a descender past the box, where RN's view would clip it. Other text (no Hiragino: other locales and all-SF strings; no lineHeight; emoji
// or other fallback faces; mixed sizes; inline views; too tight a lineHeight) is left exactly as
// TextKit lays it. Known gap: with numberOfLines, TextKit hands the last visible line the whole
// hidden tail, so an emoji / other size / inline view hidden there leaves that line as TextKit lays
// it.
//
// Switch (NSUserDefaults, read once per launch; used for the A/B gate; a launch argument
// `-OrbitTextLeading off` sets it for one launch only):
//   OrbitTextLeading = "off"  → hook disabled (RN default behaviour)
//   OrbitTextLeading = "log"  → enabled and logs each moved line
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static const void *OrbitHiraginoSizesKey = &OrbitHiraginoSizesKey;

@interface OrbitTextLeadingDelegate : NSObject <NSLayoutManagerDelegate>
@end

static BOOL OrbitTextLeadingLogging = NO;

static BOOL OrbitIsHiragino(UIFont *font)
{
  return [font.fontName hasPrefix:@"HiraginoSans"];
}

@implementation OrbitTextLeadingDelegate

- (BOOL)layoutManager:(NSLayoutManager *)layoutManager
    shouldSetLineFragmentRect:(inout CGRect *)lineFragmentRect
         lineFragmentUsedRect:(inout CGRect *)lineFragmentUsedRect
               baselineOffset:(inout CGFloat *)baselineOffset
              inTextContainer:(NSTextContainer *)textContainer
                forGlyphRange:(NSRange)glyphRange
{
  NSTextStorage *storage = layoutManager.textStorage;
  NSRange range = [layoutManager characterRangeForGlyphRange:glyphRange actualGlyphRange:NULL];
  if (!storage || range.length == 0) {
    return NO;
  }

  NSParagraphStyle *style = [storage attribute:NSParagraphStyleAttributeName atIndex:range.location effectiveRange:NULL];
  CGFloat lineHeight = style.maximumLineHeight;
  if (lineHeight <= 0 || style.minimumLineHeight != lineHeight ||
      fabs(lineFragmentRect->size.height - lineHeight) > 0.01) {
    return NO;
  }

  __block BOOL eligible = YES;
  __block CGFloat size = 0;
  [storage enumerateAttributesInRange:range
                              options:0
                           usingBlock:^(NSDictionary<NSAttributedStringKey, id> *attrs, __unused NSRange r, BOOL *stop) {
                             UIFont *font = attrs[NSFontAttributeName];
                             BOOL known = font && (OrbitIsHiragino(font) || [font.fontName hasPrefix:@"."]);
                             if (attrs[NSAttachmentAttributeName] || !known || (size > 0 && fabs(font.pointSize - size) > 0.01)) {
                               eligible = NO;
                               *stop = YES;
                               return;
                             }
                             size = font.pointSize;
                           }];
  if (!eligible) {
    return NO;
  }

  // Japanese UI: the text holds Hiragino Sans at this size (the line itself may be all SF). The
  // sizes are collected once per layout manager (RN creates one per layout pass).
  NSSet<NSNumber *> *sizes = objc_getAssociatedObject(layoutManager, OrbitHiraginoSizesKey);
  if (!sizes) {
    NSMutableSet<NSNumber *> *found = [NSMutableSet set];
    [storage enumerateAttribute:NSFontAttributeName
                        inRange:NSMakeRange(0, storage.length)
                        options:0
                     usingBlock:^(UIFont *font, __unused NSRange r, __unused BOOL *stop) {
                       if (font && OrbitIsHiragino(font)) {
                         [found addObject:@(round(font.pointSize * 100) / 100)];
                       }
                     }];
    sizes = found;
    objc_setAssociatedObject(layoutManager, OrbitHiraginoSizesKey, sizes, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  if (![sizes containsObject:@(round(size * 100) / 100)]) {
    return NO;
  }

  UIFont *system = [UIFont systemFontOfSize:size];
  if (lineHeight < system.ascender - system.descender) {
    return NO;
  }
  CGFloat shift = [[storage attribute:NSBaselineOffsetAttributeName atIndex:range.location effectiveRange:NULL] doubleValue];
  CGFloat target = (lineHeight - system.ascender + system.descender) / 2 + system.ascender + shift;
  if (fabs(target - *baselineOffset) <= 0.01) {
    return NO;
  }
  if (OrbitTextLeadingLogging) {
    NSLog(@"[OrbitTextLeading] L=%.2f base %.2f→%.2f «%@»", lineHeight, *baselineOffset, target,
          [storage.string substringWithRange:range]);
  }
  *baselineOffset = target;
  return YES;
}

@end

static OrbitTextLeadingDelegate *OrbitTextLeadingShared;
static void (*OrbitOriginalSetUsesFontLeading)(id, SEL, BOOL);

static void OrbitSetUsesFontLeading(NSLayoutManager *self, SEL _cmd, BOOL uses)
{
  OrbitOriginalSetUsesFontLeading(self, _cmd, uses);
  // RCTTextLayoutManager: a plain NSLayoutManager, fresh (no delegate yet), leading turned off.
  if (!uses && self.delegate == nil && [self class] == [NSLayoutManager class]) {
    self.delegate = OrbitTextLeadingShared;
  }
}

@interface OrbitTextLeadingLoader : NSObject
@end

@implementation OrbitTextLeadingLoader

+ (void)load
{
  NSString *mode = [[NSUserDefaults standardUserDefaults] stringForKey:@"OrbitTextLeading"];
  if ([mode isEqualToString:@"off"]) {
    return;
  }
  OrbitTextLeadingLogging = [mode isEqualToString:@"log"];
  OrbitTextLeadingShared = [OrbitTextLeadingDelegate new];
  Method method = class_getInstanceMethod([NSLayoutManager class], @selector(setUsesFontLeading:));
  if (!method) {
    return;
  }
  OrbitOriginalSetUsesFontLeading = (void (*)(id, SEL, BOOL))method_setImplementation(method, (IMP)OrbitSetUsesFontLeading);
  if (OrbitTextLeadingLogging) {
    NSLog(@"[OrbitTextLeading] enabled");
  }
}

@end
