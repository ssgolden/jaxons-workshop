# Jaxon's Workshop — SPEC.md

## 1. Concept & Vision

A vibrant, handcrafted online shop for **Jaxon**, a creative 9-year-old who makes candles, wax melts, and custom 3D printed products. The site should feel **fun, personal, and kid-made-with-love** — not like a sterile corporate store. It should reflect Jaxon's personality: playful, expressive, and proud of what he creates. The vibe is "cool kid's makerspace" meets "cozy candle shop."

## 2. Info

- **Owner**: Jaxon (age 9)
- **Products**: Handmade candles, wax melts, custom 3D printed items
- **Location**: Presumably home-based (Spain/Murcia area based on Tuckinn context)
- **Target audience**: Friends, family, local community, people looking for unique handmade gifts
- **Tone**: Fun, personal, kid-proud — not corporate or overly polished

## 3. Sections/Pages

### Pages
1. **Home** — Hero with Jaxon's intro, featured products, "About Jaxon" section
2. **Shop** — Product listings by category (Candles, Wax Melts, 3D Prints)
3. **Product Detail** — Photos, description, price, add to cart
4. **Cart/Checkout** — Order summary, customer details, place order
5. **About Jaxon** — His story, why he started, what he loves about making things
6. **Admin/Orders** — Simple staff board for Jaxon/parents to see incoming orders

## 4. Product Categories

### Candles
- Soy wax candles in jars
- scented varieties (list specific scents)

### Wax Melts
- Wax melt cubes/cl shapes
- scent families

### 3D Printed Custom Products
- Custom keychains
- Phone stands
- Desk accessories
- Personalized items (name plaques, etc.)

## 5. Technical Approach

- **Frontend**: HTML + Alpine.js (like Tuckinn) — simple, fast, mobile-first
- **Backend**: Node.js + Express + Socket.io + SQL.js (same stack as Tuckinn)
- **Styling**: Dark glassmorphism theme with fun, colorful accents
- **Real-time**: Socket.io for order notifications to admin board
- **Database**: SQLite via sql.js

## 6. Design Direction

- **Theme**: Dark background with bright, playful accent colors (neon-like greens, oranges, purples)
- **Typography**: Fun but readable — something like Poppins or Nunito for headings
- **Imagery**: Photos of Jaxon's actual products (placeholder until real photos)
- **Personality**: Include Jaxon's quotes, a photo of him, his "maker story"
- **Fun elements**: Animated elements, floating particles, colorful interactions

## 7. Order Flow

- Customer browses shop, adds items to cart
- Fills in name/contact details
- Selects order type (pickup/delivery/table QR for local)
- Places order → saved to SQLite → Socket.io notification to admin
- Simple admin board shows new orders with status workflow

## 8. Admin/Parents View

- PIN-protected staff board (simple PIN like Tuckinn: 1234)
- Shows incoming orders with status: New → Preparing → Ready → Completed
- Accessible at /staff.html
