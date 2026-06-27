'use strict';
/**
 * seed.js — Enrich the canonical demo members (created in db.js initDb)
 * with additional profile details: DOB, address, emergency contacts.
 * Safe to run multiple times (uses UPDATE, not INSERT).
 *
 * Usage:  node src/seed.js
 */

const { pool, seedChecklists } = require('./db');

// Extra profile data for the 12 canonical members created by db.js initDb
const MEMBER_EXTRAS = [

  { name:'Sarah Chen',      dob:'1972-03-15', address:'142 Oak Ridge Drive, Maplewood, MN 55119', station_email:'schen@maplewoodfd.org',     emergencyContactName:'Patricia Chen',    emergencyContactPhone:'(555) 201-0101', emergencyContactRelation:'Spouse' },
  { name:'Maria Delgado',   dob:'1979-03-14', address:'88 Birchwood Court, Maplewood, MN 55119',  station_email:'mdelgado@maplewoodfd.org',   emergencyContactName:'Carlos Delgado',    emergencyContactPhone:'(555) 201-0202', emergencyContactRelation:'Spouse' },
  { name:'Nathan McGee',    dob:'1985-11-30', address:'34 Elm Street, Maplewood, MN 55119',       station_email:'nmcgee@maplewoodfd.org',     emergencyContactName:'Sandra McGee',      emergencyContactPhone:'(555) 201-0303', emergencyContactRelation:'Spouse' },
  { name:'Sandra Kim',      dob:'1990-05-08', address:'201 Maple Lane, Maplewood, MN 55119',      station_email:'skim@maplewoodfd.org',       emergencyContactName:'David Kim',         emergencyContactPhone:'(555) 201-0404', emergencyContactRelation:'Spouse' },
  { name:'James Ortega',    dob:'1992-09-17', address:'67 Cedar Avenue, Maplewood, MN 55119',     station_email:'jortega@maplewoodfd.org',    emergencyContactName:'Rosa Ortega',       emergencyContactPhone:'(555) 201-0505', emergencyContactRelation:'Mother' },
  { name:'Tracy Benson',    dob:'1994-02-28', address:'319 Willow Way, Maplewood, MN 55119',      station_email:'tbenson@maplewoodfd.org',    emergencyContactName:'Robert Benson',     emergencyContactPhone:'(555) 201-0606', emergencyContactRelation:'Spouse' },
  { name:'Mike Harrington', dob:'1991-12-19', address:'445 Ash Road, Maplewood, MN 55119',        station_email:'mharrington@maplewoodfd.org', emergencyContactName:'Janet Harrington', emergencyContactPhone:'(555) 201-0707', emergencyContactRelation:'Mother' },
  { name:'Lisa Fontaine',   dob:'1993-06-12', address:'54 Pine Street, Maplewood, MN 55119',      station_email:'lfontaine@maplewoodfd.org',  emergencyContactName:'Marc Fontaine',     emergencyContactPhone:'(555) 201-0808', emergencyContactRelation:'Spouse' },
  { name:'Carlos Ruiz',     dob:'2001-04-03', address:'12 Spruce Court, Maplewood, MN 55119',     station_email:'cruiz@maplewoodfd.org',      emergencyContactName:'Elena Ruiz',        emergencyContactPhone:'(555) 201-0909', emergencyContactRelation:'Mother' },
  { name:'Amy Winters',     dob:'2000-08-25', address:'728 Walnut Drive, Maplewood, MN 55119',    station_email:'awinters@maplewoodfd.org',   emergencyContactName:'Thomas Winters',    emergencyContactPhone:'(555) 201-1010', emergencyContactRelation:'Father' },
  { name:'Kevin Marsh',     dob:'1988-01-20', address:'160 Linden Blvd, Maplewood, MN 55119',     station_email:'kmarsh@maplewoodfd.org',     emergencyContactName:'Sarah Marsh',       emergencyContactPhone:'(555) 201-1111', emergencyContactRelation:'Spouse' },
  { name:'Diane Tolliver',  dob:'1986-07-04', address:'92 Hickory Lane, Maplewood, MN 55119',     station_email:'dtolliver@maplewoodfd.org',  emergencyContactName:'Frank Tolliver',    emergencyContactPhone:'(555) 201-1212', emergencyContactRelation:'Spouse' },
  { name:'Sarah Chen',      dob:'1972-03-15', address:'142 Oak Ridge Drive, Maplewood, MN 55119', emergencyContactName:'Patricia Chen',    emergencyContactPhone:'(555) 201-0101', emergencyContactRelation:'Spouse', station_email:'sarah.chen@maplewoodfd.org', personal_email:'schen@gmail.com' },
  { name:'Maria Delgado',   dob:'1979-03-14', address:'88 Birchwood Court, Maplewood, MN 55119',  emergencyContactName:'Carlos Delgado',    emergencyContactPhone:'(555) 201-0202', emergencyContactRelation:'Spouse', station_email:'maria.delgado@maplewoodfd.org', personal_email:'m.delgado@yahoo.com' },
  { name:'Nathan McGee',    dob:'1985-11-30', address:'34 Elm Street, Maplewood, MN 55119',       emergencyContactName:'Sandra McGee',      emergencyContactPhone:'(555) 201-0303', emergencyContactRelation:'Spouse', station_email:'nathan.mcgee@maplewoodfd.org', personal_email:'nmcgee1985@outlook.com' },
  { name:'Sandra Kim',      dob:'1990-05-08', address:'201 Maple Lane, Maplewood, MN 55119',      emergencyContactName:'David Kim',         emergencyContactPhone:'(555) 201-0404', emergencyContactRelation:'Spouse', station_email:'sandra.kim@maplewoodfd.org', personal_email:'skim@icloud.com' },
  { name:'James Ortega',    dob:'1992-09-17', address:'67 Cedar Avenue, Maplewood, MN 55119',     emergencyContactName:'Rosa Ortega',       emergencyContactPhone:'(555) 201-0505', emergencyContactRelation:'Mother', station_email:'james.ortega@maplewoodfd.org', personal_email:'jortega.ff@gmail.com' },
  { name:'Tracy Benson',    dob:'1994-02-28', address:'319 Willow Way, Maplewood, MN 55119',      emergencyContactName:'Robert Benson',     emergencyContactPhone:'(555) 201-0606', emergencyContactRelation:'Spouse', station_email:'tracy.benson@maplewoodfd.org', personal_email:'tracybenson@yahoo.com' },
  { name:'Mike Harrington', dob:'1991-12-19', address:'445 Ash Road, Maplewood, MN 55119',        emergencyContactName:'Janet Harrington',  emergencyContactPhone:'(555) 201-0707', emergencyContactRelation:'Mother', station_email:'mike.harrington@maplewoodfd.org', personal_email:'mharrington82@gmail.com' },
  { name:'Lisa Fontaine',   dob:'1993-06-12', address:'54 Pine Street, Maplewood, MN 55119',      emergencyContactName:'Marc Fontaine',     emergencyContactPhone:'(555) 201-0808', emergencyContactRelation:'Spouse', station_email:'lisa.fontaine@maplewoodfd.org', personal_email:'lfontaine@hotmail.com' },
  { name:'Carlos Ruiz',     dob:'2001-04-03', address:'12 Spruce Court, Maplewood, MN 55119',     emergencyContactName:'Elena Ruiz',        emergencyContactPhone:'(555) 201-0909', emergencyContactRelation:'Mother', station_email:'carlos.ruiz@maplewoodfd.org', personal_email:'cruiz2001@gmail.com' },
  { name:'Amy Winters',     dob:'2000-08-25', address:'728 Walnut Drive, Maplewood, MN 55119',    emergencyContactName:'Thomas Winters',    emergencyContactPhone:'(555) 201-1010', emergencyContactRelation:'Father', station_email:'amy.winters@maplewoodfd.org', personal_email:'awinters2000@yahoo.com' },
  { name:'Kevin Marsh',     dob:'1988-01-20', address:'160 Linden Blvd, Maplewood, MN 55119',     emergencyContactName:'Sarah Marsh',       emergencyContactPhone:'(555) 201-1111', emergencyContactRelation:'Spouse', station_email:'kevin.marsh@maplewoodfd.org', personal_email:'kmarsh1988@gmail.com' },
  { name:'Diane Tolliver',  dob:'1986-07-04', address:'92 Hickory Lane, Maplewood, MN 55119',     emergencyContactName:'Frank Tolliver',    emergencyContactPhone:'(555) 201-1212', emergencyContactRelation:'Spouse', station_email:'diane.tolliver@maplewoodfd.org', personal_email:'dtolliver@icloud.com' },

];

module.exports = async function seedMembers() {
  let updated = 0;

  for (const m of MEMBER_EXTRAS) {
    const result = await pool.query(
      `UPDATE members
       SET dob = COALESCE(dob, $2),
           address = COALESCE(address, $3),
           "emergencyContactName" = COALESCE("emergencyContactName", $4),
           "emergencyContactPhone" = COALESCE("emergencyContactPhone", $5),
           "emergencyContactRelation" = COALESCE("emergencyContactRelation", $6),
           station_email = COALESCE(station_email, $7),
           personal_email = COALESCE(personal_email, $8)
       WHERE name = $1 AND station_id = 1`,
      [m.name, m.dob, m.address, m.emergencyContactName, m.emergencyContactPhone, m.emergencyContactRelation, m.station_email || '', m.personal_email || '']
    );
    if (result.rowCount > 0) updated++;
  }

  console.log(`Seed complete: ${updated} members enriched with profile details.`);

  // Seed checklists
  await seedChecklists(1);
  console.log('Checklist templates seeded.');
};
