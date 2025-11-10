import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ==== CONFIG ====
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
        adminLog: '1437112357787533436'
    },
    ticketSettings: {
        cooldownSeconds: 34,
        naming: 'cat-USERNAME-ticketNUMBER',
        autoDeleteMinutes: 10,
        embedColor: '#FFA700',
        attachmentArchiving: true
    },
    panel: {
        embedImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png?ex=6912acba&is=69115b3a&hm=f1a2108fee21ca4a78574a96b1d947dfa90a7548c99b097b692c1b858bf47783&',
        description: "Welcome to Adalea's Support channel! Please select the category that best fits your needs before opening a ticket. The corresponding team will respond to your ticket in a timely manner. Thank you for your patience and respect!",
        title: "<:verified:1406645489381806090> **Adalea Support**",
        categories: [
            { name: 'Staffing Enquiries', emoji: '<:c_flower:1437125663231315988>', role: '1402416194354544753', subtopics: ['Reporting','Applications'] },
            { name: 'Public Relations Enquiries', emoji: '<:flower_yellow:1437121213796188221>', role: '1402416210779312249', subtopics: ['Affiliation','Prize claim'] },
            { name: 'Moderation Support', emoji: '<:flower_pink:1437121075086622903>', role: '1402411949593202800', subtopics: ['Appealing','Reporting'] },
            { name: 'Leadership', emoji: '<:flower_blue:1415086940306276424>', role: '1402400285674049576', subtopics: [] },
            { name: 'General', emoji: '<:flower_green:1437121005821759688>', role: '1402417889826443356', subtopics: [] }
        ]
    }
};

// ==== EXPRESS SERVER ====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req,res)=> res.send('Adalea Ticket Bot online!'));
app.listen(PORT, ()=> console.log(`Web server listening on port ${PORT}`));

// ==== DATA STORAGE ====
let ticketData = { lastTicketNumber: 0 };
if(fs.existsSync('./tickets.json')){
    ticketData = JSON.parse(fs.readFileSync('./tickets.json', 'utf8'));
}
const tickets = new Map(); // key: userId, value: ticket info
const cooldowns = new Map(); // key: userId, value: timestamp
const stoppedCategories = new Set();
const stoppedSubtopics = new Set();

// ==== HELPERS ====
function checkCooldown(userId){
    if(!cooldowns.has(userId)) return false;
    return (Date.now() - cooldowns.get(userId)) < config.ticketSettings.cooldownSeconds*1000;
}
function updateCooldown(userId){
    cooldowns.set(userId, Date.now());
}
function createTicketName(categoryName, username, number){
    return config.ticketSettings.naming.replace('USERNAME', username).replace('cat', categoryName.toLowerCase().replace(/\s+/g,'')).replace('NUMBER', number);
}
function canRunCommand(member){
    return member.roles.cache.has(config.roles.leadership) || member.id === config.roles.specialUser;
}
async function createTranscript(channel){
    const messages = await channel.messages.fetch({limit:100});
    let content = `Transcript for #${channel.name}\n\n`;
    messages.reverse().forEach(m=>{
        content += `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}\n`;
        if(m.attachments.size>0){
            m.attachments.forEach(a=>content += `Attachment: ${a.url}\n`);
        }
    });
    const filePath = path.join(__dirname, `${channel.name}_transcript.txt`);
    fs.writeFileSync(filePath, content);
    const logChannel = await client.channels.fetch(config.channels.transcriptLog);
    await logChannel.send({files:[filePath]});
    fs.unlinkSync(filePath);
}

// ==== COMMAND HANDLER ====
client.on('messageCreate', async message=>{
    if(!message.guild || message.author.bot) return;
    const args = message.content.trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // ----- SUPPORT PANEL -----
    if(cmd === '?support' && args[0] === 'role'){
        if(!canRunCommand(message.member)) return;
        await message.delete().catch(()=>{});
        const embed = new EmbedBuilder()
            .setTitle(config.panel.title)
            .setDescription(config.panel.description)
            .setColor(config.ticketSettings.embedColor)
            .setImage(config.panel.embedImage);
        const row = new ActionRowBuilder();
        config.panel.categories.forEach(cat=>{
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_${cat.name.replace(/\s+/g,'_')}`)
                    .setLabel(cat.name)
                    .setEmoji(cat.emoji)
                    .setStyle(ButtonStyle.Primary)
            );
        });
        await message.channel.send({embeds:[embed], components:[row]});
    }

    // ----- STOP / RESUME -----
    if((cmd === '?stop' || cmd === '?resume') && args[0]){
        if(!canRunCommand(message.member)) return;
        const target = args[0];
        if(cmd === '?stop'){
            stoppedCategories.add(target);
            stoppedSubtopics.add(target);
        } else {
            stoppedCategories.delete(target);
            stoppedSubtopics.delete(target);
        }
        await message.channel.send(`Command ${cmd} executed for ${target}`);
    }

    // ----- CLOSE TICKET -----
    if(cmd === '?close'){
        if(!message.channel.name.includes('ticket')) return;
        await createTranscript(message.channel);
        await message.channel.send('Ticket closed and transcript saved.');
        setTimeout(()=>message.channel.delete().catch(()=>{}), config.ticketSettings.autoDeleteMinutes*60*1000);
    }
});

// ==== INTERACTION HANDLER ====
client.on('interactionCreate', async interaction=>{
    if(interaction.isButton()){
        const [type, catName] = interaction.customId.split('_');
        const cat = config.panel.categories.find(c=>c.name.replace(/\s+/g,'_')===catName);
        if(!cat) return;
        if(stoppedCategories.has(catName)) return interaction.reply({content:`This category is currently disabled.`, ephemeral:true});
        const userId = interaction.user.id;
        if(checkCooldown(userId)){
            await interaction.reply({content:`Please wait before creating another ticket.`, ephemeral:true});
            return;
        }
        updateCooldown(userId);

        if(cat.subtopics.length>0){
            const select = new StringSelectMenuBuilder()
                .setCustomId(`sub_${catName}`)
                .setPlaceholder('Select your issue...')
                .addOptions(cat.subtopics.map(s=>({label:s,value:s})));
            const row = new ActionRowBuilder().addComponents(select);
            await interaction.reply({content:`Select a subtopic for ${cat.name}:`, components:[row], ephemeral:true});
        } else {
            ticketData.lastTicketNumber += 1;
            const ticketNum = ticketData.lastTicketNumber;
            fs.writeFileSync('./tickets.json', JSON.stringify(ticketData, null,2));
            const ticketName = createTicketName(cat.name, interaction.user.username, ticketNum);
            const channel = await interaction.guild.channels.create({
                name: ticketName,
                type: 0,
                parent: config.channels.ticketCategory,
                permissionOverwrites:[
                    {id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
                    {id:cat.role, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
                    {id:interaction.guild.roles.everyone, deny:[PermissionsBitField.Flags.ViewChannel]}
                ]
            });
            tickets.set(userId, {channelId: channel.id, category: cat.name});
            const embed = new EmbedBuilder()
                .setTitle(`${cat.name} Ticket`)
                .setDescription(`Ticket created for ${interaction.user}.\n**Issue:** N/A`)
                .setColor(config.ticketSettings.embedColor);
            await channel.send({content:`<@${interaction.user.id}> <@&${cat.role}>`, embeds:[embed]});
            await interaction.reply({content:`Ticket created: ${channel}`, ephemeral:true});
        }
    }

    if(interaction.isStringSelectMenu()){
        const [type, catName] = interaction.customId.split('_');
        const cat = config.panel.categories.find(c=>c.name.replace(/\s+/g,'_')===catName);
        if(!cat) return;
        if(stoppedSubtopics.has(catName)) return interaction.reply({content:`This subtopic is currently disabled.`, ephemeral:true});

        ticketData.lastTicketNumber += 1;
        const ticketNum = ticketData.lastTicketNumber;
        fs.writeFileSync('./tickets.json', JSON.stringify(ticketData, null,2));
        const ticketName = createTicketName(cat.name, interaction.user.username, ticketNum);
        const channel = await interaction.guild.channels.create({
            name: ticketName,
            type: 0,
            parent: config.channels.ticketCategory,
            permissionOverwrites:[
                {id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
                {id:cat.role, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
                {id:interaction.guild.roles.everyone, deny:[PermissionsBitField.Flags.ViewChannel]}
            ]
        });
        tickets.set(interaction.user.id, {channelId: channel.id, category: cat.name});
        const embed = new EmbedBuilder()
            .setTitle(`${cat.name} Ticket`)
            .setDescription(`Ticket created for ${interaction.user}.\n**Issue:** ${interaction.values[0]}`)
            .setColor(config.ticketSettings.embedColor);
        await channel.send({content:`<@${interaction.user.id}> <@&${cat.role}>`, embeds:[embed]});
        await interaction.reply({content:`Ticket created: ${channel}`, ephemeral:true});
    }
});

// ==== READY ====
client.once('ready', ()=>console.log(`Logged in as ${client.user.tag}`));

// ==== LOGIN ====
if(!process.env.BOT_TOKEN_1) throw new Error('BOT_TOKEN_1 not found in environment!');
client.login(process.env.BOT_TOKEN_1);