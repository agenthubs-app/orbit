import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { OrbitReferenceStyles } from "../../app/(app)/app/orbit-reference-styles";
import { OrbitThemeStyles } from "../../app/(app)/app/orbit-theme";

const COMPANY = `COMPANY${"LongCompanyNameWithoutSpaces".repeat(10)}END`;
const TITLE = "職位".repeat(100);
const EMAIL = `${"long".repeat(40)}@example.test`;
const PHONE = "090".repeat(30);

async function renderLongValueDetail(): Promise<string> {
  const routeModel = await loadAppContactDetailRoute({
    contactId: "demo-contact-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") {
    throw new Error("mock contact detail route did not succeed");
  }

  const viewModel = contactDetailRouteToOrbitContactsViewModel(routeModel, "zh");
  const [baseContact] = viewModel.connections;
  assert.ok(baseContact);

  const longValueViewModel = {
    ...viewModel,
    connections: [{
      ...baseContact,
      company: COMPANY,
      email: EMAIL,
      phone: PHONE,
      title: TITLE,
    }],
  };

  const rendered = renderToStaticMarkup(
    <>
      <OrbitThemeStyles />
      <OrbitReferenceStyles />
      <OrbitLanguageProvider initialLanguage="zh">
        <OrbitRealCardConnection
          contactId={baseContact.id}
          viewModel={longValueViewModel}
        />
      </OrbitLanguageProvider>
    </>,
  );

  // The component emits a stylesheet link when the generated reference CSS is
  // present. Inline it for the browser fixture so the test measures the same
  // responsive rules without starting another web server.
  const referenceCss = readFileSync("public/orbit-reference/orbit-reference.generated.css", "utf8");
  return rendered.replace(
    '<link href="/orbit-reference/orbit-reference.generated.css" rel="stylesheet"/>',
    `<style>${referenceCss}</style>`,
  );
}

test("contact detail keeps long company, title, email and phone readable at narrow widths", async () => {
  const fixture = await renderLongValueDetail();
  assert.match(fixture, new RegExp(COMPANY));
  assert.match(fixture, new RegExp(TITLE));
  assert.match(fixture, new RegExp(EMAIL.replace(/[.+]/gu, "\\$&")));
  assert.match(fixture, new RegExp(PHONE));

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${fixture}</body></html>`,
        { waitUntil: "domcontentloaded" },
      );

      const measurements = await page.evaluate(({ company, title, email, phone }) => {
        const roles = [...document.querySelectorAll<HTMLElement>(".nc-hero-role")]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              clientWidth: element.clientWidth,
              minWidth: style.minWidth,
              overflowWrap: style.overflowWrap,
              scrollWidth: element.scrollWidth,
              text: element.textContent ?? "",
            };
          });
        const values = [...document.querySelectorAll<HTMLElement>(".nc-fv")]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              clientWidth: element.clientWidth,
              minWidth: style.minWidth,
              overflowWrap: style.overflowWrap,
              scrollWidth: element.scrollWidth,
              text: element.textContent ?? "",
            };
          });

        return {
          documentWidth: document.documentElement.scrollWidth,
          email: values.filter((value) => value.text === email),
          fields: values,
          phone: values.filter((value) => value.text === phone),
          roles: roles.filter((role) => role.text === `${company} · ${title}`),
        };
      }, { company: COMPANY, title: TITLE, email: EMAIL, phone: PHONE });

      assert.ok(
        measurements.documentWidth <= width,
        `${width}px detail should not create horizontal document overflow (got ${measurements.documentWidth}px)`,
      );
      assert.ok(measurements.roles.length > 0, `${width}px detail should render the long company/title value`);
      assert.ok(measurements.email.length > 0, `${width}px detail should render the complete email value`);
      assert.ok(measurements.phone.length > 0, `${width}px detail should render the complete phone value`);
      assert.ok(measurements.fields.length > 0, `${width}px detail should render contact fields`);

      for (const [label, fields] of Object.entries({
        "company/title": measurements.roles,
        email: measurements.email,
        phone: measurements.phone,
      })) {
        for (const field of fields) {
          assert.equal(field.minWidth, "0px", `${width}px ${label} field must allow its grid item to shrink`);
          assert.equal(field.overflowWrap, "anywhere", `${width}px ${label} field must wrap unspaced content`);
          assert.ok(
            field.scrollWidth <= field.clientWidth + 1,
            `${width}px ${label} field must not clip or overflow (client ${field.clientWidth}px, scroll ${field.scrollWidth}px)`,
          );
        }
      }

      for (const field of measurements.fields) {
        assert.equal(field.minWidth, "0px", `${width}px contact field must allow its grid item to shrink`);
        assert.equal(field.overflowWrap, "anywhere", `${width}px contact field must wrap unspaced content`);
        assert.ok(
          field.scrollWidth <= field.clientWidth + 1,
          `${width}px contact field must not clip or overflow (client ${field.clientWidth}px, scroll ${field.scrollWidth}px, text ${field.text.slice(0, 40)})`,
        );
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
});
