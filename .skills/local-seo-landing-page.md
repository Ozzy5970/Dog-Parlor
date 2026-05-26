# Local SEO Landing Page Guidance

This guide outlines rules for constructing high-performance local service landing pages to ensure visibility on search engines, organic integration of target keywords, and alignment with local business standards.

## 1. Local SEO Keywords & Placement

Integrate key local terms naturally without keyword stuffing. The primary keyword must appear naturally in the H1 heading and the introductory paragraph.

*   **Primary Keywords**:
    *   `Dog grooming in Plumstead` (Primary context)
    *   `Groomers Dog Parlour` (Brand name)
    *   `dog parlour in Plumstead` (Alternative terms)
    *   `pet grooming in Plumstead` (Broad terms)
    *   `Cape Town Southern Suburbs` (Regional context)

*   **Header Hierarchy**:
    *   `H1`: One per page, containing the primary keyword + brand name (e.g., "Professional Dog Grooming in Plumstead | Groomers Dog Parlour").
    *   `H2`/`H3`: Use for service details, FAQ, location details, and trust sections.

---

## 2. Content & Trust Requirements

A high-ranking local landing page must contain the following core modules:
1.  **Clear Service Directory**: Detail the exact dog sizes, grooming treatments, and duration guidelines.
2.  **Location & Coverage**: Explicitly mention the neighborhood (Plumstead), neighboring areas in the Cape Town Southern Suburbs, and accessibility.
3.  **Frequently Asked Questions (FAQ)**: Answer real user queries (e.g., "How long does a groom take?", "What are the notice rules?").
4.  **Booking Call-to-Action (CTA)**: High-visibility button linking directly to the booking workflow (`/book`).
5.  **Verified Business Details**: Ensure all phone, email, and address details match the Google Business Profile (GBP) exactly. **Do not invent fake addresses, placeholder phone numbers, reviews, ratings, or social links.** If the user hasn't provided a physical street address yet, mention the general area (Plumstead, Cape Town Southern Suburbs) and contact options.

---

## 3. SEO Meta Tags & Schema Markup

Include appropriate structured data in the head of the page to help search engines index the business correctly:

*   **JSON-LD LocalBusiness Schema**:
    > [!WARNING]
    > Do not include telephone, exact street address, ratings, reviews, social links, or opening hours in the schema or page copy unless they are confirmed from business settings or the owner.

    ```json
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Groomers Dog Parlour",
      "image": "https://groomersdogparlour.co.za/logo.png",
      "url": "https://groomersdogparlour.co.za",
      "telephone": "+27XXXXX",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Plumstead",
        "addressRegion": "Western Cape",
        "addressCountry": "ZA"
      },
      "priceRange": "$$"
    }
    ```
*   **robots.txt**: Ensure web spiders can crawl all client-facing pages while excluding admin pages (e.g., `Disallow: /admin/`).
*   **sitemap.xml**: Maintain an up-to-date XML sitemap listing `/`, `/book`, `/privacy`, `/terms`, and `/booking-policy`.
