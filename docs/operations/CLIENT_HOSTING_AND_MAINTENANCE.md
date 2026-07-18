# Influnet — Hosting & Maintenance Strategy

This document outlines the cloud infrastructure costs, scaling protections, and recommended maintenance strategies for the Influnet platform. It is designed to provide complete transparency on monthly operating expenses and ongoing support.

---

## 1. Cloud Infrastructure Overview

Influnet is built on a modern, serverless "Enterprise-grade" stack. Instead of renting a traditional fixed server that you pay for whether it is used or not, the platform uses a highly scalable microservice architecture. 

The two core providers are:
1. **Microsoft Azure (Container Apps):** Hosts the Next.js web application and handles global web traffic.
2. **Supabase:** Provides the secure PostgreSQL database, real-time messaging infrastructure, and user authentication.

### Expected Monthly Operating Costs
For standard production traffic, the platform is extremely cost-efficient. 

| Service | Purpose | Estimated Monthly Cost |
| :--- | :--- | :--- |
| **Supabase (Pro Tier)** | Database, Auth, Daily Backups, Storage | $25.00 / mo |
| **Azure Container Registry** | Secure storage for the application code images | ~$5.00 / mo |
| **Azure Container Apps** | Active Web Servers (Scales based on traffic) | ~$5.00 - $15.00 / mo |
| **Total Expected Cost** | **Standard Baseline Operations** | **~$35.00 - $45.00 / mo** |

*Note: The Dev and Staging environments utilize Azure's free grants and Supabase's free tiers, meaning you do not pay extra to maintain separate testing environments.*

---

## 2. Traffic Spikes & "Worst-Case" Protection

A common concern with cloud computing is unexpected billing if the website goes viral, gets featured in the media, or is targeted by malicious bot traffic (DDoS attacks).

**Influnet is configured with a hard ceiling to prevent run-away costs.**

*   **Azure Max Replicas:** The Azure servers are configured with an auto-scaling rule and a `maxReplicas` ceiling (e.g., maximum of 10 concurrent server instances). If traffic surges, Azure will automatically clone the server to handle the load, but it will **never** exceed the maximum limit. This puts a mathematical hard limit on your maximum possible monthly cost.
*   **Supabase Limits:** Supabase Pro has hard database compute limits. If limits are reached, the database will throttle (slow down) rather than automatically billing thousands of dollars for overages.

In a massive viral event, your monthly bill might temporarily increase to $60–$100, but it is mathematically prevented from reaching the thousands.

---

## 3. Support & Maintenance (SLA)

To ensure Influnet remains secure, performant, and operational over time, a **Maintenance & Support Retainer** is recommended. 

While the monthly cloud costs ($40/mo) are billed directly to your company by Microsoft and Supabase, the Maintenance Retainer covers the specialized developer time required to manage that infrastructure.

### Standard Maintenance Retainer Includes:
1. **24/7 Uptime Monitoring:** Automated alerts if the servers ever go down.
2. **Critical Bug Fixes:** Priority resolution of any critical bugs or broken flows within a guaranteed 24-48 hour window.
3. **Security Updates:** Weekly auditing and patching of NPM packages and Next.js security vulnerabilities.
4. **Minor Updates:** Up to 5-10 hours per month for minor text updates, color tweaks, or small UI adjustments.
5. **Database Backups & Health:** Verifying that Supabase daily backups are succeeding and database performance remains fast as user data grows.

*(Major new features, structural changes, or entirely new pages are scoped as separate projects outside of the standard maintenance retainer).*
