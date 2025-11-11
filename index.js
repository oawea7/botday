/**
 * Adalea Tickets v2 - Final Single File
 * - Copy this file to bot.js
 * - Create .env with BOT_TOKEN_1=your_bot_token and optional PORT
 * - npm install discord.js express dotenv
 * - node bot.js
 *
 * Channel-only mode (no DMs). Persistent state in ./tickets.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';

/* ============================
   ========== CONFIG ==========
   ============================ */
const config = {
  roles: {
    leadership: '1402400285674049576',
    specialUser: '1107787991444881408',
    moderation: '1402411949593202800',
    staffing: '1402416194354544753',
    pr: '1402416210779312249',
    supportTeam: '1402417889826443356'
  },
  channels: {
    transcriptLog: '1437112357787533436',
    ticketCategory: '1437139682361344030',
    adminLog: '1437112357787533436' // optional
  },
  ticketSettings: {
    cooldownSeconds: 34,
    naming: 'cat-USERNAME-ticketNUMBER',
    autoDeleteMinutes: 10,
    embedColor: '#FFA700',
    attachmentArchiving: false // transcripts include links only
  },
  panel: {
    embedImage:
      'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png?ex=6912acba&is=69115b3a&hm=f1a2108fee21ca4a78574a96b1d947dfa90a7548c99b097b692c1b858bf47783&',
    description:
      "Welcome to Adalea's Support channel! Please select the category that best fits your needs before opening a ticket. The corresponding team will respond to your ticket in a timely manner. Thank you for your patience and respect!",
    title: '<:verified:1406645489381806090> **Adalea Support**',
    categories: [
      {
        name: 'Moderation Support',
        emoji: '<:flower_pink:1437121075086622903>',
        role: '1402411949593202800',
        subtopics: [
          { id: 'Appealing', label: 'Appealing', description: 'Appealing a warning, mute, kick, or server ban.' },
          { id: 'Reporting', label: 'Reporting', description: 'Reporting rule-breaking behaviour. See <#1402405335964057732>.' }
        ]
      },
      {
        name: 'Staffing Enquiries',
        emoji: '<:c_flower:1437125663231315988>',
        role: '1402416194354544753',
        subtopics: [
          { id: 'Reporting', label: 'Reporting', description: 'Reporting a staff member, Middle Rank, or High Rank. See <#1402416385547702343>.' },
          { id: 'Applications', label: 'Applications', description: 'Applying for an MR or HR position, or to join Moderation.' }
        ]
      },
      {
        name: 'Public Relations Enquiries',
        emoji: '<:flower_yellow:1437121213796188221>',
        role: '1402416210779312249',
        subtopics: [
          { id: 'Affiliation', label: 'Affiliation', description: 'Forming a partnership between your group and Adalea.' },
          { id: 'PrizeClaim', label: 'Prize claim', description: 'Claiming your prize after winning an event (usually from <#1402405455669497957> or <#1402405468793602158>).'}
        ]
      },
      {
        name: 'Leadership',
        emoji: '<:flower_blue:1415086940306276424>',
        role: '1402400285674049576',
        subtopics: []
      },
      {
        name: 'General',
        emoji: '<:flower_green:1437121005821759688>',
        role: '1402417889826443356',
        subtopics: []
      }
    ]
  }
};

/* ============================
   ====== PERSISTENT STORE =====
   ============================ */
const DATA_FILE = path.join(process.cwd(), 'tickets.json');

let STORE = {
  lastTicketNumber: 0,
  panelMessageId: null,
  panelChannelId: null,
  openTickets: {} // mapping: userId -> { creatorId, channelId, category, categoryRoleId, subtopic, claimedBy, createdAt }
};

function loadStore() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      STORE = Object.assign(STORE, parsed);
    } catch (err) {
      console.error('Failed to parse tickets.json, starting fresh:', err);
      saveStore();
    }
  } else {
    saveStore();
  }
}
function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(STORE, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write tickets.json:', e);
  }
}
loadStore();

/* ============================
   ======== EXPRESS (Render) ===
   ============================ */
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Adalea Ticket Bot online!'));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

/* ============================
   ======== DISCORD BOT =======
   ============================ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const cooldowns = new Map(); // userId -> timestamp
const openTickets = new Map(); // runtime mirror of STORE.openTickets

// hydrate runtime openTickets
for (const [uid, t] of Object.entries(STORE.openTickets || {})) {
  openTickets.set(uid, t);
}

/* ----------------- Utilities ----------------- */
function normalizeKey(s) {
  if (!s) return s;
  return s.toString().trim().toLowerCase().replace(/\s+/g, '_');
}
function isLeaderOrSpecial(member) {
  if (!member) return false;
  if (member.id === config.roles.specialUser) return true;
  return member.roles.cache.has(config.roles.leadership);
}
function userOnCooldown(userId) {
  const last = cooldowns.get(userId);
  if (!last) return false;
  return Date.now() - last < config.ticketSettings.cooldownSeconds * 1000;
}
function setCooldown(userId) {
  cooldowns.set(userId, Date.now());
}
function nextTicketNumber() {
  STORE.lastTicketNumber = (STORE.lastTicketNumber || 0) + 1;
  saveStore();
  return STORE.lastTicketNumber;
}
function sanitizeName(name) {
  // keep DNS-friendly short name
  return name.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/\-+/g,'-').slice(0, 48);
}
function findCategoryByButtonId(buttonIdPart) {
  return config.panel.categories.find(c => normalizeKey(c.name) === normalizeKey(buttonIdPart));
}
function findCategoryByName(name) {
  return config.panel.categories.find(c => normalizeKey(c.name) === normalizeKey(name));
}

/* ----------------- Transcript ----------------- */
async function generateTranscript(channel) {
  try {
    let all = [];
    let lastId = null;
    for (let i = 0; i < 10; i++) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;
      const chunk = await channel.messages.fetch(opts);
      if (!chunk || chunk.size === 0) break;
      all = all.concat(Array.from(chunk.values()));
      lastId = chunk.last().id;
      if (chunk.size < 100) break;
    }
    all = all.reverse(); // chronological

    let out = `Transcript for #${channel.name}\nServer: ${channel.guild?.name || 'unknown'}\nChannel ID: ${channel.id}\nGenerated: ${new Date().toISOString()}\n\n`;
    for (const m of all) {
      out += `[${m.createdAt.toISOString()}] ${m.author.tag} (${m.author.id}): ${m.content || ''}\n`;
      if (m.attachments && m.attachments.size > 0) {
        for (const [, a] of m.attachments) {
          out += `Attachment: ${a.url}\n`;
        }
      }
      out += '\n';
    }

    const filename = `${channel.name.replace(/[^a-z0-9_\-]/gi, '_')}_transcript_${Date.now()}.txt`;
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, out, 'utf8');

    // send to transcript log channel
    try {
      const logCh = await client.channels.fetch(config.channels.transcriptLog);
      if (logCh && logCh.isTextBased?.()) {
        await logCh.send({ content: `Transcript for <#${channel.id}>`, files: [filePath] });
      } else if (logCh && logCh.isTextBased === undefined && logCh.send) {
        // fallback for older typings
        await logCh.send({ content: `Transcript for <#${channel.id}>`, files: [filePath] });
      }
    } catch (err) {
      console.error('Failed to send transcript to log channel:', err);
    }

    // cleanup
    try { fs.unlinkSync(filePath); } catch (e) {}
  } catch (err) {
    console.error('Error generating transcript:', err);
  }
}

/* ----------------- State helpers ----------------- */
function recordOpenTicket(userId, ticketRecord) {
  STORE.openTickets[userId] = ticketRecord;
  saveStore();
  openTickets.set(userId, ticketRecord);
}
function removeOpenTicketByChannel(channelId) {
  for (const [uid, t] of Object.entries(STORE.openTickets || {})) {
    if (t.channelId === channelId) {
      delete STORE.openTickets[uid];
      saveStore();
      openTickets.delete(uid);
      break;
    }
  }
}

/* ============================
   ==== Message command handler
   ============================ */
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const content = message.content.trim();
  if (!content.startsWith('?')) return;

  const parts = content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // === support panel command ===
  if (cmd === '?supportpanel') {
    // permission check
    if (!isLeaderOrSpecial(message.member)) {
      return message.reply({ content: 'You do not have permission to run that command.', allowedMentions: { repliedUser: false } });
    }

    // attempt to delete existing panel to prevent duplicates
    if (STORE.panelMessageId && STORE.panelChannelId) {
      try {
        const oldCh = await client.channels.fetch(STORE.panelChannelId).catch(() => null);
        if (oldCh && oldCh.isTextBased?.()) {
          const oldMsg = await oldCh.messages.fetch(STORE.panelMessageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        }
      } catch (e) {}
    }

    // delete command message for cleanliness
    await message.delete().catch(() => {});

    // build embed
    const embed = new EmbedBuilder()
      .setTitle(config.panel.title)
      .setDescription(config.panel.description)
      .setColor(config.ticketSettings.embedColor)
      .setImage(config.panel.embedImage);

    // build buttons
    const row = new ActionRowBuilder();
    for (const cat of config.panel.categories) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticketbtn_${normalizeKey(cat.name)}`)
          .setLabel(cat.name)
          .setEmoji(cat.emoji)
          .setStyle(ButtonStyle.Primary)
      );
    }

    const sent = await message.channel.send({ embeds: [embed], components: [row] });
    STORE.panelMessageId = sent.id;
    STORE.panelChannelId = sent.channel.id;
    saveStore();
    return;
  }

  // === stop / resume ===
  if ((cmd === '?stop' || cmd === '?resume') && args.length > 0) {
    if (!isLeaderOrSpecial(message.member)) {
      return message.reply({ content: 'You do not have permission to run that command.', allowedMentions: { repliedUser: false } });
    }
    const targetRaw = args.join(' ').trim();
    const key = normalizeKey(targetRaw);

    // category?
    const cat = config.panel.categories.find(c => normalizeKey(c.name) === key);
    if (cat) {
      if (cmd === '?stop') {
        STORE.stoppedCategories = STORE.stoppedCategories || [];
        if (!STORE.stoppedCategories.includes(key)) STORE.stoppedCategories.push(key);
      } else {
        STORE.stoppedCategories = STORE.stoppedCategories || [];
        STORE.stoppedCategories = STORE.stoppedCategories.filter(x => x !== key);
      }
      saveStore();
      return message.reply({ content: `Category "${cat.name}" ${cmd === '?stop' ? 'stopped' : 'resumed'}.`, allowedMentions: { repliedUser: false } });
    }

    // subtopic search
    let found = false;
    for (const c of config.panel.categories) {
      for (const s of c.subtopics) {
        if (normalizeKey(s.id) === key || normalizeKey(s.label) === key) {
          const composite = `${normalizeKey(c.name)}::${normalizeKey(s.id)}`;
          STORE.stoppedSubtopics = STORE.stoppedSubtopics || [];
          if (cmd === '?stop') {
            if (!STORE.stoppedSubtopics.includes(composite)) STORE.stoppedSubtopics.push(composite);
          } else {
            STORE.stoppedSubtopics = STORE.stoppedSubtopics.filter(x => x !== composite);
          }
          saveStore();
          found = true;
          await message.reply({ content: `Subtopic "${s.label}" in category "${c.name}" ${cmd === '?stop' ? 'stopped' : 'resumed'}.`, allowedMentions: { repliedUser: false } });
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      return message.reply({ content: `No category or subtopic found for "${targetRaw}".`, allowedMentions: { repliedUser: false } });
    }
    return;
  }

  // === close fallback command inside ticket ===
  if (cmd === '?close') {
    const ch = message.channel;
    // check store to find if this channel is a ticket
    const ticketRecord = Object.values(STORE.openTickets || {}).find(t => t.channelId === ch.id);
    if (!ticketRecord) {
      return message.reply({ content: 'This command only works inside a ticket channel.', allowedMentions: { repliedUser: false } });
    }

    // permission: creator, category staff, leadership, or special user
    const isCreator = message.author.id === ticketRecord.creatorId;
    const isLeader = message.member.roles.cache.has(config.roles.leadership);
    const isSpecial = message.author.id === config.roles.specialUser;
    const isCategoryStaff = message.member.roles.cache.has(ticketRecord.categoryRoleId);

    if (!(isCreator || isLeader || isSpecial || isCategoryStaff)) {
      return message.reply({ content: 'You do not have permission to close this ticket.', allowedMentions: { repliedUser: false } });
    }

    await message.reply({ content: 'Closing ticket and generating transcript...', allowedMentions: { repliedUser: false } });
    await generateTranscript(ch);
    await ch.send('Ticket closed and transcript saved.');
    removeOpenTicketByChannel(ch.id);
    setTimeout(() => ch.delete().catch(() => {}), config.ticketSettings.autoDeleteMinutes * 60 * 1000);
    return;
  }
});

/* ============================
   ===== Interaction handler ===
   ============================ */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) {
    // channel-only bot
    try { if (!interaction.replied) await interaction.reply({ content: 'This bot runs in-server only.', ephemeral: true }); } catch {}
    return;
  }

  // BUTTONS
  if (interaction.isButton()) {
    const cid = interaction.customId;

    // = Panel category button =
    if (cid.startsWith('ticketbtn_')) {
      const btnKey = cid.replace('ticketbtn_', '');
      const cat = findCategoryByButtonId(btnKey);
      if (!cat) return interaction.reply({ content: 'Category not found.', ephemeral: true });

      // check global stop lists from STORE
      STORE.stoppedCategories = STORE.stoppedCategories || [];
      if (STORE.stoppedCategories.includes(normalizeKey(cat.name))) {
        return interaction.reply({ content: 'This category is currently disabled.', ephemeral: true });
      }

      // cooldown
      const uid = interaction.user.id;
      if (userOnCooldown(uid)) {
        return interaction.reply({ content: `You are currently on cooldown. Please wait before creating another ticket.`, ephemeral: true });
      }
      setCooldown(uid);

      // show select menu if needed
      if (cat.subtopics && cat.subtopics.length > 0) {
        const options = cat.subtopics.map(s => ({
          label: s.label,
          value: s.id,
          description: s.description?.slice(0, 100) || undefined
        }));

        const sel = new StringSelectMenuBuilder()
          .setCustomId(`subsel_${normalizeKey(cat.name)}`)
          .setPlaceholder(`Select an option for ${cat.name}`)
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(sel);
        return interaction.reply({ content: 'Choose your subtopic (only you can see this).', components: [row], ephemeral: true });
      }

      // create ticket without subtopic
      try {
        const ticketNum = nextTicketNumber();
        const rawName = config.ticketSettings.naming.replace('USERNAME', interaction.user.username).replace('NUMBER', ticketNum).replace('cat', cat.name.toLowerCase().replace(/\s+/g,'-'));
        const name = sanitizeName(rawName);

        const channel = await interaction.guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: config.channels.ticketCategory,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
            { id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: config.roles.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: config.roles.specialUser, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });

        const ticketRecord = {
          creatorId: interaction.user.id,
          channelId: channel.id,
          category: cat.name,
          categoryRoleId: cat.role,
          subtopic: null,
          claimedBy: null,
          createdAt: new Date().toISOString()
        };
        recordOpenTicket(interaction.user.id, ticketRecord);

        const embed = new EmbedBuilder()
          .setTitle(`${cat.name} Ticket`)
          .setDescription(`Ticket created for <@${interaction.user.id}>.\n**Issue:** N/A`)
          .setColor(config.ticketSettings.embedColor)
          .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('Claim').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`close_${channel.id}`).setLabel('Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${interaction.user.id}> <@&${cat.role}>`, embeds: [embed], components: [actionRow] });
        return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
      } catch (err) {
        console.error('Ticket create fail:', err);
        return interaction.reply({ content: 'Failed to create ticket. Contact staff.', ephemeral: true });
      }
    }

    // = Claim / Close buttons =
    if (cid.startsWith('claim_') || cid.startsWith('close_')) {
      // parse
      const [action, channelId] = cid.split('_');
      // find record (runtime or store fallback)
      let ticketRec = Array.from(openTickets.values()).find(t => t.channelId === channelId);
      if (!ticketRec) {
        ticketRec = Object.values(STORE.openTickets || {}).find(t => t.channelId === channelId);
      }
      if (!ticketRec) return interaction.reply({ content: 'Ticket not found or already closed.', ephemeral: true });

      const member = interaction.member;
      const isLeader = member.roles.cache.has(config.roles.leadership);
      const isSpecial = interaction.user.id === config.roles.specialUser;
      const isCategoryStaff = ticketRec.categoryRoleId ? member.roles.cache.has(ticketRec.categoryRoleId) : false;
      const isCreator = interaction.user.id === ticketRec.creatorId;

      if (action === 'claim') {
        if (!(isCategoryStaff || isLeader || isSpecial)) {
          return interaction.reply({ content: 'You cannot claim this ticket.', ephemeral: true });
        }

        const claimedTag = `${interaction.user.tag}`;
        // update runtime and STORE
        for (const [uid, v] of openTickets) {
          if (v.channelId === channelId) {
            v.claimedBy = claimedTag;
            STORE.openTickets[uid].claimedBy = claimedTag;
            saveStore();
          }
        }
        for (const uid of Object.keys(STORE.openTickets)) {
          if (STORE.openTickets[uid].channelId === channelId) {
            STORE.openTickets[uid].claimedBy = claimedTag;
            saveStore();
            break;
          }
        }

        // update embed message in ticket channel
        try {
          const ch = await client.channels.fetch(channelId);
          if (ch && ch.isTextBased()) {
            const msgs = await ch.messages.fetch({ limit: 50 });
            const embedMsg = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
            if (embedMsg) {
              const oldEmbed = EmbedBuilder.from(embedMsg.embeds[0]);
              oldEmbed.setFooter({ text: `Claimed by ${interaction.user.tag}` });
              await embedMsg.edit({ embeds: [oldEmbed] }).catch(() => {});
            }
            await interaction.reply({ content: `You claimed this ticket.`, ephemeral: true });
          } else {
            await interaction.reply({ content: `Ticket channel not accessible.`, ephemeral: true });
          }
        } catch (err) {
          console.error('Claim update fail:', err);
          try { await interaction.reply({ content: 'Failed to claim ticket (error).', ephemeral: true }); } catch {}
        }
        return;
      }

      if (action === 'close') {
        // permission: category staff, leadership, special user, or creator
        let allowed = false;
        if (isCategoryStaff || isLeader || isSpecial || isCreator) allowed = true;
        if (!allowed) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

        // to avoid "This interaction failed", defer reply
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        try {
          const ch = await client.channels.fetch(channelId);
          if (!ch || !ch.isTextBased()) {
            return interaction.editReply({ content: 'Ticket channel not found or not a text channel.' }).catch(() => {});
          }
          await generateTranscript(ch);
          await ch.send('Ticket closed and transcript saved.');

          // remove from store & runtime
          removeOpenTicketByChannel(channelId);

          // schedule deletion
          setTimeout(() => {
            client.channels.fetch(channelId).then(c => c?.delete().catch(() => {})).catch(() => {});
          }, config.ticketSettings.autoDeleteMinutes * 60 * 1000);

          return interaction.editReply({ content: 'Ticket will be closed and deleted shortly.' }).catch(() => {});
        } catch (err) {
          console.error('Error on close button:', err);
          try { await interaction.editReply({ content: 'Failed to close ticket.' }); } catch {}
        }
        return;
      }
    }
  }

  // SELECT MENUS (subtopic selection)
  if (interaction.isStringSelectMenu()) {
    const cid = interaction.customId;
    if (!cid.startsWith('subsel_')) return;
    const catKey = cid.replace('subsel_', '');
    const cat = findCategoryByName(catKey);
    if (!cat) return interaction.reply({ content: 'Category not found.', ephemeral: true });

    const sel = interaction.values[0]; // subtopic id
    // check stopped subtopics
    STORE.stoppedSubtopics = STORE.stoppedSubtopics || [];
    const compositeKey = `${normalizeKey(cat.name)}::${normalizeKey(sel)}`;
    if (STORE.stoppedSubtopics.includes(compositeKey)) {
      return interaction.reply({ content: 'This subtopic is currently disabled.', ephemeral: true });
    }

    // cooldown
    if (userOnCooldown(interaction.user.id)) {
      return interaction.reply({ content: `You are currently on cooldown. Please wait before creating another ticket.`, ephemeral: true });
    }
    setCooldown(interaction.user.id);

    // create ticket with selected subtopic
    try {
      const ticketNum = nextTicketNumber();
      const rawName = config.ticketSettings.naming.replace('USERNAME', interaction.user.username).replace('NUMBER', ticketNum).replace('cat', cat.name.toLowerCase().replace(/\s+/g,'-'));
      const name = sanitizeName(rawName);

      const channel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: config.channels.ticketCategory,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
          { id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: config.roles.leadership, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: config.roles.specialUser, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const ticketRecord = {
        creatorId: interaction.user.id,
        channelId: channel.id,
        category: cat.name,
        categoryRoleId: cat.role,
        subtopic: sel,
        claimedBy: null,
        createdAt: new Date().toISOString()
      };
      recordOpenTicket(interaction.user.id, ticketRecord);

      const embed = new EmbedBuilder()
        .setTitle(`${cat.name} Ticket`)
        .setDescription(`Ticket created for <@${interaction.user.id}>.\n**Issue:** ${sel}`)
        .setColor(config.ticketSettings.embedColor)
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('Claim').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`close_${channel.id}`).setLabel('Close').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ content: `<@${interaction.user.id}> <@&${cat.role}>`, embeds: [embed], components: [actionRow] });
      return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    } catch (err) {
      console.error('Ticket create (select) fail:', err);
      return interaction.reply({ content: 'Failed to create ticket. Contact staff.', ephemeral: true });
    }
  }
});

/* ============================
   ====== READY & LOGIN =======
   ============================ */
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

if (!process.env.BOT_TOKEN_1) {
  console.error('BOT_TOKEN_1 not found in environment. Create a .env file with BOT_TOKEN_1=yourtoken');
  process.exit(1);
}

client.login(process.env.BOT_TOKEN_1).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});