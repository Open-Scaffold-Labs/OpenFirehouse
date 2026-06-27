'use strict';
const express = require('express');
const router = express.Router();
const { fundraising } = require('../db');

function isOfficer(user) {
  return user?.role === 'chief' || user?.role === 'officer';
}

router.get('/campaigns', async (req, res) => {
  try {
    const data = await fundraising.allCampaigns(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    if (!req.body.name || String(req.body.name).trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    const data = await fundraising.createCampaign(req.user.department_id, {
      name: req.body.name,
      description: req.body.description || '',
      type: req.body.type || 'Fund Drive',
      goal_amount: req.body.goal_amount || 0,
      start_date: req.body.start_date || null,
      end_date: req.body.end_date || null,
      status: req.body.status || 'Planning',
      created_by: req.user.id,
    });
    res.status(201).json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.patch('/campaigns/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    const id = Number(req.params.id);
    const data = await fundraising.updateCampaign(id, req.user.department_id, req.body);
    if (!data) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    const id = Number(req.params.id);
    const success = await fundraising.removeCampaign(id, req.user.department_id);
    if (!success) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ message: `Campaign ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

router.get('/donations', async (req, res) => {
  try {
    const campaignId = req.query.campaign_id ? Number(req.query.campaign_id) : null;
    // allDonations handles the optional campaign filter itself.
    // (Pre-2026-06-10 this called fundraising.donationsByCampaign, which
    // doesn't exist — ?campaign_id=N always threw 500. W2.5 audit.)
    const data = await fundraising.allDonations(req.user.department_id, campaignId);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

router.get('/donations/all', async (req, res) => {
  try {
    const data = await fundraising.allDonations(req.user.department_id);
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

router.post('/donations', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    if (!req.body.donor_name || String(req.body.donor_name).trim() === '') {
      return res.status(400).json({ error: 'donor_name is required' });
    }
    if (typeof req.body.amount !== 'number' || req.body.amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const data = await fundraising.createDonation(req.user.department_id, {
      campaign_id: req.body.campaign_id || null,
      donor_name: req.body.donor_name,
      donor_email: req.body.donor_email || '',
      donor_phone: req.body.donor_phone || '',
      donor_address: req.body.donor_address || '',
      amount: req.body.amount,
      method: req.body.method || 'Check',
      reference: req.body.reference || '',
      notes: req.body.notes || '',
      donated_at: req.body.donated_at || null,
    });
    res.status(201).json({ data });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create donation' });
  }
});

router.delete('/donations/:id', async (req, res) => {
  try {
    if (!isOfficer(req.user)) {
      return res.status(403).json({ error: 'Officer or chief access required' });
    }
    const id = Number(req.params.id);
    const success = await fundraising.removeDonation(id, req.user.department_id);
    if (!success) {
      return res.status(404).json({ error: 'Donation not found' });
    }
    res.json({ message: `Donation ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete donation' });
  }
});

module.exports = router;
