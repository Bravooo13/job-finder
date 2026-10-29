-- LinkedIn's public job search joins every saved search's sources (Job Finder reads it slowly, without a login).
UPDATE `searches` SET `sources` = json_insert(`sources`, '$[#]', 'linkedin') WHERE `sources` NOT LIKE '%linkedin%';
